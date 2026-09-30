import type { ApiError } from "@selo/core";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  toBody(): ApiError {
    return { error: this.code, message: this.message };
  }
}

export function notFound(what: string, id: string): HttpError {
  return new HttpError(404, "NOT_FOUND", `${what} ${id} does not exist`);
}

export function conflict(code: string, message: string): HttpError {
  return new HttpError(409, code, message);
}

export function invalidRequest(message: string, code = "VALIDATION_FAILED"): HttpError {
  return new HttpError(400, code, message);
}
