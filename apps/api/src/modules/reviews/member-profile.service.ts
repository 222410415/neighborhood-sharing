/**
 * Public member profile — an explicit safe projection: display name,
 * neighborhood only if the member allows it, biography, verification labels,
 * reputation from visible reviews, and whether a photo exists. Never email,
 * roles or account status.
 */

import { Injectable } from "@nestjs/common";
import {
  DEFAULT_PRIVACY_PREFERENCES,
  type MemberProfileDto,
  type ProfileStorage,
  type ReviewDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { NotFoundException } from "../../common/errors/api-exceptions.js";
import type { MediaDocument } from "../media/media.repository.js";
import { decodeImageBytes } from "../media/base64-helpers.js";
import { labelsFor, verifiedChecks } from "../verification/verification-labels.js";
import { ReviewService } from "./review.service.js";

@Injectable()
export class MemberProfileService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly reviews: ReviewService,
  ) {}

  private async completedProfile(uid: string): Promise<ProfileStorage> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.users).doc(uid).get();
    const profile = snap.exists ? (snap.data() as ProfileStorage) : null;
    if (!profile || !profile.completedProfile || profile.accountStatus === "suspended") {
      throw new NotFoundException("Member not found");
    }
    return profile;
  }

  async profile(uid: string): Promise<MemberProfileDto> {
    const profile = await this.completedProfile(uid);
    const privacy = profile.privacyPreferences ?? DEFAULT_PRIVACY_PREFERENCES;
    let neighborhoodName: string | null = null;
    if (privacy.showNeighborhood && profile.neighborhoodId) {
      const n = await this.firebase.firestore.collection(COLLECTIONS.neighborhoods).doc(profile.neighborhoodId).get();
      neighborhoodName = (n.data()?.["nameEn"] as string | undefined) ?? null;
    }
    const [checks, reputation] = await Promise.all([
      verifiedChecks(this.firebase.firestore, uid),
      this.reviews.reputation(uid),
    ]);
    return {
      uid,
      displayName: profile.displayName,
      neighborhoodName,
      biographyEn: profile.biographyEn || null,
      memberSince: profile.createdAt ?? null,
      hasPhoto: !!profile.profileMediaId,
      verificationLabels: labelsFor(checks),
      reputation,
      reviewsHidden: !privacy.showReviews,
    };
  }

  /** Visible reviews; empty when the member chose not to show review texts. */
  async reviewsOf(uid: string): Promise<{ items: ReviewDto[]; hiddenByMember: boolean }> {
    const profile = await this.completedProfile(uid);
    const privacy = profile.privacyPreferences ?? DEFAULT_PRIVACY_PREFERENCES;
    if (!privacy.showReviews) return { items: [], hiddenByMember: true };
    return { items: await this.reviews.listForMember(uid), hiddenByMember: false };
  }

  /** Profile photo (public by design; only the member's current "profile" upload). */
  async photo(uid: string, variant: "main" | "thumbnail"): Promise<{ bytes: Buffer; mimeType: string }> {
    const profile = await this.completedProfile(uid);
    if (!profile.profileMediaId) throw new NotFoundException("Photo not found");
    const snap = await this.firebase.firestore.collection(COLLECTIONS.media).doc(profile.profileMediaId).get();
    const media = snap.exists ? (snap.data() as MediaDocument) : null;
    if (!media || media.purpose !== "profile" || media.parentId !== uid || media.ownerUid !== uid) {
      throw new NotFoundException("Photo not found");
    }
    try {
      return {
        bytes: decodeImageBytes(variant === "main" ? media.mainBase64 : media.thumbnailBase64),
        mimeType: media.mimeType,
      };
    } catch {
      throw new NotFoundException("Photo not found");
    }
  }
}
