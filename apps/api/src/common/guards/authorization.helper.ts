import { Injectable } from "@nestjs/common";
import type { VerifiedUser } from "../guards/auth.guard.js";
import { ForbiddenException } from "../errors/api-exceptions.js";

@Injectable()
export class AuthorizationHelper {
  /**
   * Assert that the authenticated user owns the given resource.
   * Throws ForbiddenException if not.
   */
  assertOwner(user: VerifiedUser, ownerUid: string): void {
    if (user.uid !== ownerUid) {
      throw new ForbiddenException("You do not own this resource");
    }
  }

  /**
   * Check ownership without throwing.
   */
  isOwner(user: VerifiedUser, ownerUid: string): boolean {
    return user.uid === ownerUid;
  }

  /**
   * Return 404 instead of 403 for unauthorized resource access
   * to avoid leaking the existence of private resources.
   */
  assertOwnerOrNotFound(user: VerifiedUser, ownerUid: string): void {
    if (user.uid !== ownerUid) {
      throw new ForbiddenException("Resource not found");
    }
  }
}
