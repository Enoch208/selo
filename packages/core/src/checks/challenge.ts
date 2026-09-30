import { z } from "zod";
import { parseAtomicUnits } from "../money";
import { isRecordValue } from "./object-guards";

export const acceptSchema = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: z.string(),
    asset: z.string(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export type X402Accept = z.infer<typeof acceptSchema>;

const resourceSchema = z
  .object({
    url: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    serviceName: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .loose();

const challengeSchema = z
  .object({
    x402Version: z.number(),
    error: z.string().optional(),
    resource: resourceSchema.optional(),
    accepts: z.array(acceptSchema),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export type X402Challenge = z.infer<typeof challengeSchema>;

export type ParseChallengeResult =
  | { readonly ok: true; readonly challenge: X402Challenge }
  | { readonly ok: false; readonly issue: string };

export function parseChallenge(value: unknown): ParseChallengeResult {
  const result = challengeSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, issue: result.error.message };
  }
  return { ok: true, challenge: result.data };
}

export interface DiscoveryPolicy {
  readonly network: string;
  readonly asset: string;
}

export interface AlgorandRequirement {
  readonly scheme: "exact";
  readonly network: string;
  readonly asset: string;
  readonly amountMicros: number;
  readonly payTo: string;
  readonly maxTimeoutSeconds: number | null;
  readonly extra: Record<string, unknown> | undefined;
}

export function selectRequirement(
  challenge: X402Challenge,
  policy: DiscoveryPolicy,
): AlgorandRequirement | null {
  const match = challenge.accepts.find(
    (entry) =>
      entry.scheme === "exact" && entry.network === policy.network && entry.asset === policy.asset,
  );
  if (match === undefined) {
    return null;
  }
  return {
    scheme: "exact",
    network: match.network,
    asset: match.asset,
    amountMicros: parseAtomicUnits(match.amount) ?? 0,
    payTo: match.payTo,
    maxTimeoutSeconds: match.maxTimeoutSeconds ?? null,
    extra: match.extra,
  };
}

export function bazaarInfo(challenge: X402Challenge): unknown {
  const extensions = challenge.extensions;
  if (!isRecordValue(extensions)) {
    return undefined;
  }
  const bazaar = extensions.bazaar;
  if (!isRecordValue(bazaar)) {
    return undefined;
  }
  return bazaar.info;
}
