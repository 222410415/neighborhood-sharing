/** GET /v1/me/roles — the signed-in member's roles (to show the Admin link). */

import { Controller, Get, UseGuards } from "@nestjs/common";
import type { RolesDto } from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { RolesService } from "./roles.service.js";

@Controller("me/roles")
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  async mine(@CurrentUser() user: VerifiedUser): Promise<RolesDto> {
    const roles = await this.roles.rolesOf(user.uid);
    return {
      roles,
      isReviewer: roles.includes("reviewer") || roles.includes("admin"),
      isAdmin: roles.includes("admin"),
    };
  }
}
