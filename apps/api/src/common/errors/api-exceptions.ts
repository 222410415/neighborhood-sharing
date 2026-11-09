import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { ErrorCode, FieldError } from "@neighborhood/contracts";

export class ApiException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly fieldErrors?: FieldError[],
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        error: {
          code: errorCode,
          message,
          fieldErrors,
          ...(details ? { details } : {}),
          requestId: requestId ?? "unknown",
        },
      },
      status,
    );
  }
}

export class UnauthorizedException extends ApiException {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends ApiException {
  constructor(message = "You do not have access to this resource", details?: Record<string, unknown>) {
    super("FORBIDDEN", message, HttpStatus.FORBIDDEN, undefined, undefined, details);
  }
}

export class NotFoundException extends ApiException {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, HttpStatus.NOT_FOUND);
  }
}

export class ValidationException extends ApiException {
  constructor(fieldErrors: FieldError[], message = "Validation failed") {
    super("VALIDATION_ERROR", message, HttpStatus.UNPROCESSABLE_ENTITY, fieldErrors);
  }
}

export class ConflictException extends ApiException {
  /** `details` carries machine-readable context, e.g. { reason: "quote_changed", quote }. */
  constructor(message = "Conflict with current state", details?: Record<string, unknown>) {
    super("CONFLICT", message, HttpStatus.CONFLICT, undefined, undefined, details);
  }
}

export class PayloadTooLargeException extends ApiException {
  constructor(message = "Payload too large") {
    super("PAYLOAD_TOO_LARGE", message, HttpStatus.PAYLOAD_TOO_LARGE);
  }
}

export class RateLimitedException extends ApiException {
  constructor(message = "Too many requests") {
    super("RATE_LIMITED", message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class BadRequestException extends ApiException {
  constructor(message = "Bad request") {
    super("BAD_REQUEST", message, HttpStatus.BAD_REQUEST);
  }
}
