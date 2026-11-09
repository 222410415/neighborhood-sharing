/**
 * Roles — read from roleAssignments/{uid} on every privileged request.
 * Every member has "member"; "admin" is granted by script only, never by the
 * member. A stored "reviewer" (before D-43) counts as "admin".
 */

import { Injectable } from "@nestjs/common";
import type { Role } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

export interface RoleAssignmentDoc {
  uid: string;
  /** May still hold the pre-D-43 value "reviewer". */
  roles: string[];
  grantedByUid: string;
  grantedAt: string;
  revokedAt: string | null;
  revision: number;
}

/** Stored values that grant the admin role ("reviewer" is the pre-D-43 name). */
const ADMIN_VALUES: readonly string[] = ["admin", "reviewer"];

@Injectable()
export class RolesService {
  constructor(private readonly firebase: FirebaseService) {}

  async rolesOf(uid: string): Promise<Role[]> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.roleAssignments).doc(uid).get();
    const doc = snap.exists ? (snap.data() as RoleAssignmentDoc) : null;
    const isAdmin = !!doc && !doc.revokedAt && doc.roles.some((r) => ADMIN_VALUES.includes(r));
    return isAdmin ? ["member", "admin"] : ["member"];
  }

  async isAdmin(uid: string): Promise<boolean> {
    return (await this.rolesOf(uid)).includes("admin");
  }
}
