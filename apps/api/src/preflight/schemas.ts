import { httpMethods, type PreflightBody } from "@selo/core";
import { z } from "zod";

export const maxRequestBodyBytes = 16 * 1024;

const requestBodySchema = z
  .json()
  .refine((value) => value !== null, "requestBody must not be null; omit it to send no body")
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value)) <= maxRequestBodyBytes,
    `requestBody must serialize to at most ${String(maxRequestBodyBytes)} bytes`,
  );

export const preflightBodySchema = z
  .strictObject({
    authorizationId: z.string().max(64),
    targetUrl: z.string().max(2048),
    method: z.enum(httpMethods),
    requestBody: requestBodySchema.exactOptional(),
  })
  .refine((body) => body.method === "POST" || body.requestBody === undefined, {
    message: "requestBody is only allowed with POST",
    path: ["requestBody"],
  }) satisfies z.ZodType<unknown, PreflightBody>;

export type PreflightInput = z.output<typeof preflightBodySchema>;
