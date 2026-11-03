/**
 * Roles — read from roleAssignments/{uid} on every privileged request.
 * Every member has "member"; "reviewer" and "admin" are granted by script or
 * an admin only, never by the member.
 */

import { Injectable } from "@nestjs/common";
import type { Role } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

export interface RoleAssignmentDoc {
  uid: string;
  roles: Role[];
  grantedByUid: string;
  grantedAt: string;
  revokedAt: string | null;
  revision: number;
}

const PRIVILEGED: readonly Role[] = ["reviewer", "admin"];

@Injectable()
export class RolesService {
  constructor(private readonly firebase: FirebaseService) {}

  async rolesOf(uid: string): Promise<Role[]> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.roleAssignments).doc(uid).get();
    const doc = snap.exists ? (snap.data() as RoleAssignmentDoc) : null;
    const granted = doc && !doc.revokedAt ? doc.roles.filter((r) => PRIVILEGED.includes(r)) : [];
    return ["member", ...new Set(granted)];
  }

  async isReviewer(uid: string): Promise<boolean> {
    const roles = await this.rolesOf(uid);
    return roles.includes("reviewer") || roles.includes("admin");
  }
}
