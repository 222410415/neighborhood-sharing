/**
 * Conversation controller — participants only (404 for anyone else).
 *
 * POST /v1/me/conversations                    — find or create (listing enquiry or booking)
 * GET  /v1/me/conversations                    — list with unread markers
 * GET  /v1/me/conversations/:id                — one conversation
 * GET  /v1/me/conversations/:id/messages?after — poll with a cursor
 * POST /v1/me/conversations/:id/messages       — send (clientMessageId makes it idempotent)
 * POST /v1/me/conversations/:id/read           — mark read
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  createConversationBodySchema,
  sendMessageBodySchema,
  type CreateConversationBody,
  type SendMessageBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { ConversationService } from "./conversation.service.js";

@Controller("me/conversations")
@UseGuards(AuthGuard)
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Post()
  @UseInterceptors(new ZodValidationInterceptor(createConversationBodySchema))
  @HttpCode(HttpStatus.OK)
  async open(@CurrentUser() user: VerifiedUser, @Body() body: CreateConversationBody) {
    return this.conversations.open(user.uid, body);
  }

  @Get()
  async list(@CurrentUser() user: VerifiedUser) {
    return { items: await this.conversations.list(user.uid) };
  }

  @Get(":id")
  async get(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.conversations.get(user.uid, id);
  }

  @Get(":id/messages")
  async messages(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Query("after") after?: string,
  ) {
    return this.conversations.messages(user.uid, id, typeof after === "string" && after ? after : undefined);
  }

  @Post(":id/messages")
  @UseGuards(RateLimitGuard)
  @RateLimit("messages")
  @UseInterceptors(new ZodValidationInterceptor(sendMessageBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async send(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: SendMessageBody) {
    return this.conversations.send(user.uid, id, body);
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    await this.conversations.markRead(user.uid, id);
  }
}
