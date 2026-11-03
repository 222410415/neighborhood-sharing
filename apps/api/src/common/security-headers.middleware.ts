import { Injectable, NestMiddleware } from "@nestjs/common";
import type { Response, NextFunction } from "express";

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: unknown, res: Response, next: NextFunction) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("x-xss-protection", "0");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );
    next();
  }
}
