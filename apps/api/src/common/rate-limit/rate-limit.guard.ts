/**
 * In-memory rate limits on abuse-prone actions (per member, or per client
 * address on public routes). Sliding window per route group. Limits can be
 * changed without code: RATE_LIMIT_<GROUP>=<count>/<seconds>, for example
 * RATE_LIMIT_POLICY=10/60. One API instance only (fine for the free host).
 *
 * Use after AuthGuard so the member id is known:
 *   @UseGuards(AuthGuard, RateLimitGuard) @RateLimit("messages")
 */

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitedException } from "../errors/api-exceptions.js";

export type RateLimitGroup = "bookings" | "messages" | "reports" | "requests" | "offers" | "ai" | "policy";

const DEFAULTS: Record<RateLimitGroup, { limit: number; windowMs: number }> = {
  bookings: { limit: 20, windowMs: 60_000 },
  messages: { limit: 30, windowMs: 60_000 },
  reports: { limit: 10, windowMs: 60 * 60_000 },
  requests: { limit: 10, windowMs: 60 * 60_000 },
  offers: { limit: 20, windowMs: 60 * 60_000 },
  ai: { limit: 60, windowMs: 60_000 },
  policy: { limit: 10, windowMs: 60_000 },
};

export const RATE_LIMIT_KEY = "rateLimitGroup";
export const RateLimit = (group: RateLimitGroup) => SetMetadata(RATE_LIMIT_KEY, group);

export function limitFor(group: RateLimitGroup): { limit: number; windowMs: number } {
  const raw = process.env[`RATE_LIMIT_${group.toUpperCase()}`];
  const match = raw?.match(/^(\d+)\/(\d+)$/);
  if (match) return { limit: Number(match[1]), windowMs: Number(match[2]) * 1000 };
  return DEFAULTS[group];
}

const hits = new Map<string, number[]>();

function clientKey(request: {
  user?: { uid: string };
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string {
  if (request.user?.uid) return `u:${request.user.uid}`;
  const forwarded = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return `ip:${first || request.ip || "unknown"}`;
}

/** Records one hit; returns seconds to wait when the limit is exceeded, else 0. */
export function hit(group: RateLimitGroup, subject: string, now = Date.now()): number {
  const { limit, windowMs } = limitFor(group);
  const key = `${group}|${subject}`;
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) {
    for (const [k, times] of hits) if (times.every((t) => t <= now - windowMs)) hits.delete(k);
  }
  return 0;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const group = this.reflector.getAllAndOverride<RateLimitGroup | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!group) return true;
    const http = context.switchToHttp();
    const wait = hit(group, clientKey(http.getRequest()));
    if (wait > 0) {
      http.getResponse().setHeader("Retry-After", String(wait));
      throw new RateLimitedException(`Too many requests. Try again in ${wait} seconds.`);
    }
    return true;
  }
}
