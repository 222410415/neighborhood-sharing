/**
 * Media repository — Firestore CRUD for media documents.
 * Base64 fields are stored in the document (exempt from indexing).
 */

import { Injectable } from "@nestjs/common";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

export interface MediaDocument {
  id: string;
  ownerUid: string;
  listingId: string | null;
  uploadState: "pending" | "attached" | "orphaned";
  mimeType: string;
  /** Stored main image size (resized). Documents before Sprint 3 hold the original size here. */
  widthPx: number;
  heightPx: number;
  thumbnailWidthPx?: number;
  thumbnailHeightPx?: number;
  originalWidthPx?: number;
  originalHeightPx?: number;
  mainSizeBytes: number;
  thumbnailSizeBytes: number;
  checksum: string;
  mainBase64: string;
  thumbnailBase64: string;
  clientSubmissionId: string | null;
  createdAt: string;
  expiresAt: string | null;
  isDemo: boolean;
  /** Absent on documents written before Sprint 2, which are listing images. */
  purpose?: "listing" | "condition" | "profile" | "report";
  parentType?: "listing" | "conditionReport" | "profile" | "report" | null;
  parentId?: string | null;
  /** Condition photos only: the booking whose participants may read them. */
  bookingId?: string | null;
}

@Injectable()
export class MediaRepository {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.media);
  }

  async create(media: MediaDocument): Promise<MediaDocument> {
    await this.collection.doc(media.id).set(media);
    return media;
  }

  async getById(id: string): Promise<MediaDocument | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as MediaDocument;
  }

  async getByIdForOwner(id: string, ownerUid: string): Promise<MediaDocument | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as MediaDocument;
    if (data.ownerUid !== ownerUid) return null;
    return data;
  }

  async getByClientSubmissionId(
    ownerUid: string,
    clientSubmissionId: string,
  ): Promise<MediaDocument | null> {
    const snap = await this.collection
      .where("ownerUid", "==", ownerUid)
      .where("clientSubmissionId", "==", clientSubmissionId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0]!.data() as MediaDocument;
  }

  async updateState(id: string, state: "pending" | "attached" | "orphaned", listingId?: string | null): Promise<void> {
    const update: Record<string, unknown> = { uploadState: state };
    if (listingId !== undefined) {
      update["listingId"] = listingId;
    }
    await this.collection.doc(id).update(update);
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }

  async getStalePending(olderThan: Date): Promise<MediaDocument[]> {
    const snap = await this.collection
      .where("uploadState", "==", "pending")
      .where("expiresAt", "<", olderThan.toISOString())
      .get();
    return snap.docs.map((d) => d.data() as MediaDocument);
  }

  /**
   * Attach media to a listing atomically.
   * Verifies every media belongs to the owner and is not already attached.
   */
  async attachToListing(
    mediaIds: string[],
    listingId: string,
    ownerUid: string,
  ): Promise<{ attached: string[]; rejected: { id: string; reason: string }[] }> {
    const batch = this.firebase.firestore.batch();
    const attached: string[] = [];
    const rejected: { id: string; reason: string }[] = [];

    for (const mediaId of mediaIds) {
      const doc = await this.collection.doc(mediaId).get();
      if (!doc.exists) {
        rejected.push({ id: mediaId, reason: "not_found" });
        continue;
      }

      const data = doc.data() as MediaDocument;
      if (data.ownerUid !== ownerUid) {
        rejected.push({ id: mediaId, reason: "not_owner" });
        continue;
      }

      if (data.listingId !== null) {
        rejected.push({ id: mediaId, reason: "already_attached" });
        continue;
      }

      if (data.purpose && data.purpose !== "listing") {
        rejected.push({ id: mediaId, reason: "wrong_purpose" });
        continue;
      }

      batch.update(doc.ref, {
        uploadState: "attached",
        listingId,
        purpose: "listing",
        parentType: "listing",
        parentId: listingId,
      });
      attached.push(mediaId);
    }

    if (attached.length > 0) {
      await batch.commit();
    }

    return { attached, rejected };
  }

  /**
   * Detach media from a listing. Only listing images attached to that
   * listing qualify; condition photos (private evidence) are never detached.
   */
  async detachFromListing(mediaId: string, ownerUid: string, listingId?: string): Promise<void> {
    const doc = await this.collection.doc(mediaId).get();
    if (!doc.exists) return;

    const data = doc.data() as MediaDocument;
    if (data.ownerUid !== ownerUid) return;
    if (data.purpose && data.purpose !== "listing") return;
    if (listingId !== undefined && data.listingId !== listingId) return;

    await this.collection.doc(mediaId).update({
      uploadState: "orphaned",
      listingId: null,
    });
  }
}
