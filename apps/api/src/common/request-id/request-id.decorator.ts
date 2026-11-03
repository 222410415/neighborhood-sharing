import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/** The request id set by RequestIdMiddleware, for audit events. */
export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest();
  const id = request.requestId ?? request.headers?.["x-request-id"];
  return typeof id === "string" ? id : null;
});
