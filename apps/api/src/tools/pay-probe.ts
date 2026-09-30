import { formatMicros, parseAtomicUnits, parseChallenge, type X402Accept } from "@selo/core";
import { readChallenge } from "../payments/challenge-io";
import { seloNetworks } from "../payments/networks";
import { messageChain } from "../payments/transport";
import type { ToolFetch } from "./facilitator-client";
import { networkNameOf } from "./payment-decision";

export const jsonHeaders = { "content-type": "application/json", accept: "application/json" };

export function redirectOf(response: Response): string | null {
  if (response.status < 300 || response.status > 399) {
    return null;
  }
  const location = response.headers.get("location") ?? "no location";
  return `target redirected (HTTP ${String(response.status)} to ${location}); nothing further sent`;
}

export interface ProbedChallenge {
  readonly decoded: unknown;
  readonly accept: X402Accept;
  readonly amountMicros: number;
  readonly price: string;
  readonly tag: string | null;
}

export type ProbeOutcome =
  | { readonly ok: true; readonly challenge: ProbedChallenge }
  | { readonly ok: false; readonly message: string };

const refused = (message: string): ProbeOutcome => ({ ok: false, message });

function algorandUsdcAccepts(decoded: unknown): X402Accept[] | string {
  const parsed = parseChallenge(decoded);
  if (!parsed.ok) {
    return `PAYMENT-REQUIRED is not an x402 challenge: ${parsed.issue}`;
  }
  return parsed.challenge.accepts.filter((entry) => {
    const name = networkNameOf(entry.network);
    return (
      entry.scheme === "exact" && name !== null && seloNetworks[name].usdcAssetId === entry.asset
    );
  });
}

function describe(decoded: unknown, accept: X402Accept): ProbedChallenge {
  const amountMicros = parseAtomicUnits(accept.amount) ?? Number.NaN;
  return {
    decoded,
    accept,
    amountMicros,
    price: Number.isNaN(amountMicros) ? accept.amount : formatMicros(amountMicros),
    tag: typeof accept.extra?.tag === "string" ? accept.extra.tag : null,
  };
}

export async function probeChallenge(
  fetch: ToolFetch,
  url: string,
  body: string,
): Promise<ProbeOutcome> {
  let unpaid: Response;
  try {
    unpaid = await fetch(url, { method: "POST", headers: jsonHeaders, body, redirect: "manual" });
  } catch (error: unknown) {
    return refused(`unpaid request failed: ${messageChain(error)}`);
  }
  const redirected = redirectOf(unpaid);
  if (redirected !== null) {
    await unpaid.body?.cancel();
    return refused(redirected);
  }
  const challenge = readChallenge(unpaid);
  const unpaidText = (await unpaid.text()).slice(0, 500);
  if (unpaid.status !== 402 || challenge.decoded === null) {
    const why = challenge.decodeError ?? unpaidText;
    return refused(
      `expected a 402 with PAYMENT-REQUIRED, got HTTP ${String(unpaid.status)}: ${why}`,
    );
  }
  const accepts = algorandUsdcAccepts(challenge.decoded);
  if (typeof accepts === "string") {
    return refused(accepts);
  }
  const [accept, ...others] = accepts;
  if (accept === undefined || others.length > 0) {
    return refused(
      `expected exactly one Algorand USDC requirement, found ${String(accepts.length)}`,
    );
  }
  return { ok: true, challenge: describe(challenge.decoded, accept) };
}
