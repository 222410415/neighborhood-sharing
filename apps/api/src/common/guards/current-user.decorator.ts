import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { VerifiedUser } from "../guards/auth.guard.js";

export const CurrentUser = createParamDecorator(
  (data: keyof VerifiedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as VerifiedUser | undefined;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
