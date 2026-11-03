import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FirebaseService } from "../../modules/firebase/firebase.service.js";
import type { VerifiedUser } from "./auth.guard.js";

/**
 * For public routes that personalise their answer when a member is signed in
 * (for example "is this my item?"). A valid bearer token sets request.user;
 * a missing or invalid token is treated as a visitor. Never rejects.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];

    if (typeof header === "string" && header.startsWith("Bearer ")) {
      const token = header.slice(7).trim();
      if (token) {
        try {
          const decoded = await this.firebase.auth.verifyIdToken(token, false);
          const user: VerifiedUser = { uid: decoded.uid, email: decoded.email, token: decoded };
          request.user = user;
        } catch {
          // Treat as a visitor.
        }
      }
    }
    return true;
  }
}
