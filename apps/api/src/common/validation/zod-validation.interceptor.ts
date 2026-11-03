import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { ZodSchema } from "zod";
import type { FieldError } from "@neighborhood/contracts";
import { ValidationException } from "../errors/api-exceptions.js";

@Injectable()
export class ZodValidationInterceptor<T> implements NestInterceptor {
  constructor(
    private readonly schema: ZodSchema<T>,
    private readonly source: "body" | "query" | "params" = "body",
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();

    let data: unknown;
    switch (this.source) {
      case "body":
        data = request.body;
        break;
      case "query":
        data = request.query;
        break;
      case "params":
        data = request.params;
        break;
    }

    const result = this.schema.safeParse(data);

    if (!result.success) {
      const fieldErrors: FieldError[] = result.error.issues.map((issue) => ({
        field: String(issue.path.join(".")),
        message: String(issue.message),
      }));
      throw new ValidationException(fieldErrors);
    }

    if (this.source === "body") {
      request.body = result.data;
    } else if (this.source === "query") {
      request.query = result.data;
    } else {
      request.params = result.data;
    }

    return next.handle();
  }
}
