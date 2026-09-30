import type { Network, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { z } from "zod";

export interface GuardedRequirement {
  readonly network: string;
  readonly asset: string;
  readonly amount: string;
  readonly payTo: string;
}

export type MismatchReason = "challenge_unparseable" | "network_not_registered" | "not_offered";

export class RequirementMismatch extends Error {
  override readonly name = "RequirementMismatch";
  readonly reason: MismatchReason;

  constructor(reason: MismatchReason) {
    super(`guarded requirement is not payable: ${reason}`);
    this.reason = reason;
  }
}

const acceptSchema = z.looseObject({
  scheme: z.string(),
  network: z.templateLiteral([z.string(), ":", z.string()]),
  asset: z.string(),
  amount: z.string().regex(/^\d+$/),
  payTo: z.string(),
  maxTimeoutSeconds: z.number(),
  extra: z.record(z.string(), z.unknown()),
});

const challengeSchema = z.looseObject({
  x402Version: z.literal(2),
  resource: z.looseObject({ url: z.string() }),
  accepts: z.array(z.unknown()),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

function offers(entry: unknown, requirement: GuardedRequirement): PaymentRequirements | null {
  const parsed = acceptSchema.safeParse(entry);
  if (!parsed.success) {
    return null;
  }
  const accept = parsed.data;
  const matches =
    accept.scheme === "exact" &&
    accept.network === requirement.network &&
    accept.asset === requirement.asset &&
    accept.amount === requirement.amount &&
    accept.payTo === requirement.payTo;
  return matches ? accept : null;
}

export interface SelectedAccept {
  readonly accept: PaymentRequirements;
  readonly paymentRequired: PaymentRequired;
}

export function selectGuardedAccept(
  decoded: unknown,
  requirement: GuardedRequirement,
  registered: Network,
): SelectedAccept {
  const challenge = challengeSchema.safeParse(decoded);
  if (!challenge.success) {
    throw new RequirementMismatch("challenge_unparseable");
  }
  if (requirement.network !== registered) {
    throw new RequirementMismatch("network_not_registered");
  }
  const accept = challenge.data.accepts
    .map((entry) => offers(entry, requirement))
    .find((candidate) => candidate !== null);
  if (accept === undefined) {
    throw new RequirementMismatch("not_offered");
  }
  const { extensions, ...rest } = challenge.data;
  const base: PaymentRequired = { ...rest, accepts: [accept] };
  return { accept, paymentRequired: extensions === undefined ? base : { ...base, extensions } };
}
