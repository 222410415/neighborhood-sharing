import { Injectable } from "@nestjs/common";
import type { ProfileStorage } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

/** Safe member lookups: display names only, never email. */
@Injectable()
export class MemberDirectory {
  constructor(private readonly firebase: FirebaseService) {}

  async profile(uid: string): Promise<ProfileStorage | null> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.users).doc(uid).get();
    return snap.exists ? (snap.data() as ProfileStorage) : null;
  }

  async displayNames(uids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(uids.filter(Boolean))];
    const names = new Map<string, string>();
    if (unique.length === 0) return names;
    const refs = unique.map((uid) => this.firebase.firestore.collection(COLLECTIONS.users).doc(uid));
    const snaps = await this.firebase.firestore.getAll(...refs);
    snaps.forEach((snap, i) => {
      const data = snap.exists ? (snap.data() as Partial<ProfileStorage>) : null;
      names.set(unique[i]!, data?.displayName || "Member");
    });
    return names;
  }

  async displayName(uid: string): Promise<string> {
    return (await this.displayNames([uid])).get(uid) ?? "Member";
  }
}
