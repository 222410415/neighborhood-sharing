import type { ZodType } from "zod";
import type { FieldError } from "@neighborhood/contracts";
import { ValidationException } from "../errors/api-exceptions.js";

/**
 * Validate a value against a shared schema and return the parsed result, or
 * throw the standard 422 validation error. Used for query strings, which
 * cannot be replaced in place on an Express 5 request.
 */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: FieldError[] = result.error.issues.map((issue) => ({
      field: String(issue.path.join(".")),
      message: String(issue.message),
    }));
    throw new ValidationException(fieldErrors);
  }
  return result.data;
}
