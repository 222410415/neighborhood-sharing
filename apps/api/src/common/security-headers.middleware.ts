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
    // API answers are dynamic. Without this, Firebase Hosting gives responses
    // that carry no Cache-Control (notably 404s) max-age=600 and serves them
    // from its CDN, so a restored listing or reinstated member stays "not
    // found" for up to 10 minutes. Routes that may be cached (listing photos)
    // set their own header later and override this default.
    res.setHeader("cache-control", "no-store");
    next();
  }
}
