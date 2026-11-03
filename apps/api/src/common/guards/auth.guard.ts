import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FirebaseService } from "../../modules/firebase/firebase.service.js";
import { UnauthorizedException } from "../errors/api-exceptions.js";

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

    try {
      const decodedToken = await this.firebase.auth.verifyIdToken(token, false);
      const user: VerifiedUser = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        token: decodedToken,
      };
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
