import { Injectable } from "@nestjs/common";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import type { FirebaseAdminInstance } from "./firebase-admin.js";

@Injectable()
export class FirebaseService {
  private readonly _firestore: Firestore;
  private readonly _auth: Auth;
  private readonly _projectId: string;

  constructor(instance: FirebaseAdminInstance) {
    this._firestore = instance.firestore;
    this._auth = instance.auth;
    this._projectId = instance.projectId;
  }

  get firestore(): Firestore {
    return this._firestore;
  }

  get auth(): Auth {
    return this._auth;
  }

  get projectId(): string {
    return this._projectId;
  }
}
