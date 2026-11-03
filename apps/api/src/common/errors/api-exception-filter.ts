import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import type { ErrorResponse } from "@neighborhood/contracts";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const requestId = request.headers["x-request-id"] ?? "unknown";

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      let errorResponse: ErrorResponse;

      if (typeof body === "object" && body !== null && "error" in body) {
        errorResponse = body as ErrorResponse;
        if (errorResponse.error.requestId === "unknown") {
          errorResponse.error.requestId = requestId;
        }
      } else {
        errorResponse = {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            requestId,
          },
        };
      }

      response.status(status).json(errorResponse);
      return;
    }

    // Non-HTTP exceptions
    console.error("[unhandled]", { requestId, err: exception });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
    });
  }
}
