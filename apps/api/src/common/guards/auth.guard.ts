import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FirebaseService } from "../../modules/firebase/firebase.service.js";
import { ForbiddenException, UnauthorizedException } from "../errors/api-exceptions.js";
import { isSuspended, SUSPENDED_MESSAGE } from "./account-status.js";
import { COLLECTIONS } from "../repositories/base.repository.js";

export interface VerifiedUser {
  uid: string;
  email: string | undefined;
  token: DecodedIdToken;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    const token = authHeader.slice(7);

    if (!token || token.trim().length === 0) {
      throw new UnauthorizedException("Empty bearer token");
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await this.firebase.auth.verifyIdToken(token, false);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (await isSuspended(this.firebase.firestore.collection(COLLECTIONS.users), decodedToken.uid)) {
      throw new ForbiddenException(SUSPENDED_MESSAGE, { reason: "account_suspended" });
    }
    const user: VerifiedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      token: decodedToken,
    };
    request.user = user;
    return true;
  }
}
