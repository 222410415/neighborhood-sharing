import { Injectable } from "@nestjs/common";
import type { Firestore, DocumentData } from "firebase-admin/firestore";

export const COLLECTIONS = {
  users: "users",
  regions: "regions",
  cities: "cities",
  neighborhoods: "neighborhoods",
  categories: "categories",
  listings: "listings",
  media: "media",
  seedManifests: "seedManifests",
  // Sprint 2: exchange workflow
  calendarControls: "calendarControls",
  availabilityBlocks: "availabilityBlocks",
  bookings: "bookings",
  bookingEvents: "bookingEvents",
  bookingPrivateDetails: "bookingPrivateDetails",
  payments: "payments",
  deposits: "deposits",
  conditionReports: "conditionReports",
  conversations: "conversations",
  messages: "messages",
  notifications: "notifications",
  // Sprint 3: trust, community and AI
  roleAssignments: "roleAssignments",
  auditEvents: "auditEvents",
  reviews: "reviews",
  reports: "reports",
  disputes: "disputes",
  verificationChecks: "verificationChecks",
  favorites: "favorites",
  requestPosts: "requestPosts",
  requestOffers: "requestOffers",
  policies: "policies",
  policyChunks: "policyChunks",
  assistantDiagnostics: "assistantDiagnostics",
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

@Injectable()
export abstract class BaseRepository<T extends DocumentData> {
  protected abstract collectionName: string;

  constructor(protected readonly firestore: Firestore) {}

  protected get collection() {
    return this.firestore.collection(this.collectionName);
  }

  async getById(id: string): Promise<T | null> {
    const snap = await this.collection.doc(id).get();
    if (!snap.exists) return null;
    return snap.data()! as T;
  }
}
