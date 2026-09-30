import { httpMethods, type CreateAuthorizationBody } from "@selo/core";
import { z } from "zod";

export const createAuthorizationSchema = z.strictObject({
  targetUrl: z.string().max(2048),
  method: z.enum(httpMethods),
  project: z.string().trim().min(1).max(80),
  contact: z.string().trim().min(3).max(200),
}) satisfies z.ZodType<unknown, CreateAuthorizationBody>;

export const grantConsentSchema = createAuthorizationSchema.extend({
  note: z.string().trim().min(1).max(1000),
});
