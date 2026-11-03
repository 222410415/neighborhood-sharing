/**
 * RolesGuard — server-side role check for privileged routes. Use after
 * AuthGuard: `@UseGuards(AuthGuard, RolesGuard) @RequireRoles("reviewer", "admin")`.
 * Hiding a link in the interface is not access control; this is.
 */

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@neighborhood/contracts";
import type { VerifiedUser } from "../../common/guards/auth.guard.js";
import { ForbiddenException, UnauthorizedException } from "../../common/errors/api-exceptions.js";
import { RolesService } from "./roles.service.js";

export const ROLES_KEY = "requiredRoles";

/** Any one of the listed roles is enough. */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context.switchToHttp().getRequest();
    const user = request.user as VerifiedUser | undefined;
    if (!user) throw new UnauthorizedException();
    const roles = await this.roles.rolesOf(user.uid);
    request.roles = roles;
    if (required.length > 0 && !required.some((r) => roles.includes(r))) {
      throw new ForbiddenException("This area is for authorised reviewers only.");
    }
    return true;
  }
}
