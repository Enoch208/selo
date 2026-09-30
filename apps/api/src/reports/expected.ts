import type { ExpectedContract } from "@selo/core";
import { z } from "zod";

const expectedSchema = z.object({
  status: z.number().int().optional(),
  contentType: z.string().optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

export class StoredContractInvalid extends Error {
  override readonly name = "StoredContractInvalid";
}

export function storedContract(expectedJson: unknown): ExpectedContract {
  const parsed = expectedSchema.safeParse(expectedJson ?? {});
  if (!parsed.success) {
    throw new StoredContractInvalid(
      `stored expected contract is malformed: ${parsed.error.message}`,
    );
  }
  const { status, contentType, jsonSchema } = parsed.data;
  return {
    ...(status === undefined ? {} : { status }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(jsonSchema === undefined ? {} : { jsonSchema }),
  };
}
