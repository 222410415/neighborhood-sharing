/**
 * Notification controller — the signed-in member's own notifications only.
 *
 * GET  /v1/me/notifications               — newest first (bounded)
 * GET  /v1/me/notifications/unread-count  — for the bell badge
 * POST /v1/me/notifications/read-all
 * POST /v1/me/notifications/:id/read
 */

import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { NotificationService } from "./notification.service.js";

@Controller("me/notifications")
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(@CurrentUser() user: VerifiedUser) {
    return { items: await this.notifications.list(user.uid) };
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() user: VerifiedUser) {
    return { count: await this.notifications.unreadCount(user.uid) };
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async readAll(@CurrentUser() user: VerifiedUser) {
    return this.notifications.markAllRead(user.uid);
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  async read(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.notifications.markRead(user.uid, id);
  }
}
