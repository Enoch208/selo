import { compileContract, profiles, type ExpectedContract, type ReleaseTestBody } from "@selo/core";
import type { Context } from "hono";
import { z } from "zod";
import { invalidRequest } from "../http/errors";
import { readBody } from "../http/input";

const expectedSchema = z.strictObject({
  status: z.number().int().optional(),
  contentType: z.string().max(200).optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

const releaseTestSchema = z.strictObject({
  preflightId: z.string().min(1).max(64),
  profile: z.enum(profiles),
  expected: expectedSchema.optional(),
});

export const idempotencyKeyPattern = /^[A-Za-z0-9_-]{8,128}$/;

export interface ReleaseRequest {
  readonly body: ReleaseTestBody;
  readonly idempotencyKey: string | null;
}

function withoutUndefined(expected: z.output<typeof expectedSchema>): ExpectedContract {
  return {
    ...(expected.status === undefined ? {} : { status: expected.status }),
    ...(expected.contentType === undefined ? {} : { contentType: expected.contentType }),
    ...(expected.jsonSchema === undefined ? {} : { jsonSchema: expected.jsonSchema }),
  };
}

export async function readReleaseRequest(c: Context): Promise<ReleaseRequest> {
  const header = c.req.header("Idempotency-Key");
  if (header !== undefined && !idempotencyKeyPattern.test(header)) {
    throw invalidRequest("Idempotency-Key must be 8-128 characters of A-Z, a-z, 0-9, _ or -");
  }
  const parsed = await readBody(c, releaseTestSchema);
  const body: ReleaseTestBody = {
    preflightId: parsed.preflightId,
    profile: parsed.profile,
    ...(parsed.expected === undefined ? {} : { expected: withoutUndefined(parsed.expected) }),
  };
  if (body.expected !== undefined) {
    const compiled = compileContract(body.expected);
    if (!compiled.ok) {
      throw invalidRequest(`expected: ${compiled.issue}`);
    }
  }
  return { body, idempotencyKey: header ?? null };
}
