import { Injectable } from "@nestjs/common";
import { FirebaseService } from "../../modules/firebase/firebase.service.js";
import { COLLECTIONS } from "./base.repository.js";
import type {
  ProfileStorage,
  CreateProfileBody,
  UpdateProfileBody,
} from "@neighborhood/contracts";
import { ConflictException, ValidationException } from "../errors/api-exceptions.js";

@Injectable()
export class ProfileRepository {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.users);
  }

  async getByUid(uid: string): Promise<ProfileStorage | null> {
    const doc = await this.collection.doc(uid).get();
    if (!doc.exists) return null;
    return doc.data() as ProfileStorage;
  }

  async create(
    uid: string,
    email: string,
    body: CreateProfileBody,
  ): Promise<ProfileStorage> {
    const now = new Date().toISOString();
    const profile: ProfileStorage = {
      uid,
      email,
      displayName: body.displayName,
      neighborhoodId: body.neighborhoodId,
      regionId: null,
      cityId: null,
      preferredLocale: body.preferredLocale ?? "en-SA",
      biographyEn: body.biographyEn,
      biographyAr: body.biographyAr,
      verificationStatus: "unverified",
      accountStatus: "active",
      completedProfile: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.doc(uid).set(profile);
    return profile;
  }

  async update(
    uid: string,
    body: UpdateProfileBody,
  ): Promise<ProfileStorage> {
    const docRef = this.collection.doc(uid);
    const media = this.firebase.firestore.collection(COLLECTIONS.media);

    return this.firebase.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      if (!doc.exists) {
        throw new ConflictException("Profile not found; use PUT to create");
      }
      const current = doc.data() as ProfileStorage;

      // Profile photo: a "profile" upload owned by this member, or null to remove.
      const photoChanges = body.profileMediaId !== undefined && body.profileMediaId !== (current.profileMediaId ?? null);
      if (photoChanges && body.profileMediaId) {
        const upload = (await tx.get(media.doc(body.profileMediaId))).data() as
          | { ownerUid?: string; purpose?: string; parentId?: string | null; uploadState?: string }
          | undefined;
        if (
          !upload ||
          upload.ownerUid !== uid ||
          upload.purpose !== "profile" ||
          (upload.parentId && upload.parentId !== uid)
        ) {
          throw new ValidationException([
            { field: "profileMediaId", message: "Upload the photo as a profile photo first." },
          ]);
        }
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (body.displayName !== undefined)
        updateData["displayName"] = body.displayName;
      if (body.neighborhoodId !== undefined)
        updateData["neighborhoodId"] = body.neighborhoodId;
      if (body.preferredLocale !== undefined)
        updateData["preferredLocale"] = body.preferredLocale;
      if (body.biographyEn !== undefined)
        updateData["biographyEn"] = body.biographyEn;
      if (body.biographyAr !== undefined)
        updateData["biographyAr"] = body.biographyAr;
      if (body.privacyPreferences !== undefined)
        updateData["privacyPreferences"] = body.privacyPreferences;
      if (body.notificationPreferences !== undefined)
        updateData["notificationPreferences"] = body.notificationPreferences;
      if (photoChanges) updateData["profileMediaId"] = body.profileMediaId ?? null;

      tx.update(docRef, updateData);
      if (photoChanges && body.profileMediaId) {
        tx.update(media.doc(body.profileMediaId), {
          uploadState: "attached",
          parentType: "profile",
          parentId: uid,
          expiresAt: null,
        });
      }
      if (photoChanges && current.profileMediaId) {
        tx.update(media.doc(current.profileMediaId), {
          uploadState: "orphaned",
          parentType: null,
          parentId: null,
        });
      }
      return { ...current, ...updateData } as ProfileStorage;
    });
  }
}
