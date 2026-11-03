import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { createLogger } from "./logger.js";

const logger = createLogger("api");

class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const requestId = req.headers["x-request-id"] ?? "unknown";
    logger.info(
      {
        requestId,
        method: req.method,
        url: req.url,
      },
      "incoming request",
    );
    return next.handle();
  }
}

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class LoggingModule {}
