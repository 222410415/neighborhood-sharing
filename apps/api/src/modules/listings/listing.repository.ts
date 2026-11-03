/**
 * Listing repository — full Firestore CRUD for listing documents.
 */

import { Injectable } from "@nestjs/common";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

export interface ListingDocument {
  id: string;
  slug: string;
  ownerUid: string;
  categoryId: string;
  neighborhoodId: string;
  titleEn: string;
  titleAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
  specificationEn?: string;
  includedAccessories: string[];
  condition: string;
  status: "draft" | "published" | "paused" | "archived";
  lendingMode: "free" | "paid";
  currency: string;
  dailyRateHalalas: number;
  depositHalalas: number;
  estimatedReplacementHalalas?: number;
  billingUnit: string;
  minimumBillableDays: number;
  maximumBillableDays: number;
  inventoryUnits: number;
  fulfillment: string;
  primaryMediaId: string | null;
  mediaIds: string[];
  pricingBasis?: string;
  searchTokens: string[];
  revision: number;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
  // Sprint 2 booking configuration (absent until the owner sets it up)
  bookingMode?: "approval" | "instant";
  bookableFrom?: string | null;
  bookableUntil?: string | null;
}

@Injectable()
export class ListingRepository {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.listings);
  }

  async getById(id: string): Promise<ListingDocument | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as ListingDocument;
  }

  async getByIdForOwner(id: string, ownerUid: string): Promise<ListingDocument | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as ListingDocument;
    if (data.ownerUid !== ownerUid) return null;
    return data;
  }

  async getForOwner(ownerUid: string, status?: string): Promise<ListingDocument[]> {
    let query = this.collection.where("ownerUid", "==", ownerUid);
    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as ListingDocument);
  }

  async create(id: string, data: Partial<ListingDocument>): Promise<void> {
    await this.collection.doc(id).set(data, { merge: true });
  }

  /**
   * Apply an update only if the stored revision matches, inside a Firestore
   * transaction, so two concurrent edits cannot both succeed. `check` runs on
   * the current record inside the transaction and may veto the update.
   */
  async updateWithRevision(
    id: string,
    expectedRevision: number,
    updates: Record<string, unknown>,
    check?: (current: ListingDocument) => string | null,
  ): Promise<{ success: boolean; data?: ListingDocument; error?: string }> {
    const docRef = this.collection.doc(id);

    return this.firebase.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);

      if (!doc.exists) {
        return { success: false, error: "not_found" };
      }

      const current = doc.data() as ListingDocument;

      if (current.revision !== expectedRevision) {
        return { success: false, error: "conflict" };
      }

      const vetoed = check?.(current);
      if (vetoed) {
        return { success: false, error: vetoed };
      }

      const updateData = {
        ...updates,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };

      tx.update(docRef, updateData);
      return { success: true, data: { ...current, ...updateData } as ListingDocument };
    });
  }

  async updateStatus(
    id: string,
    expectedRevision: number,
    newStatus: "draft" | "published" | "paused" | "archived",
    allowedFrom?: readonly string[],
  ): Promise<{ success: boolean; data?: ListingDocument; error?: string }> {
    return this.updateWithRevision(id, expectedRevision, { status: newStatus }, (current) =>
      allowedFrom && !allowedFrom.includes(current.status) ? "invalid_transition" : null,
    );
  }

  async isPublished(id: string): Promise<boolean> {
    const listing = await this.getById(id);
    if (!listing) return false;
    return listing.status === "published";
  }
}
