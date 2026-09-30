import { readChallenge } from "../payments/challenge-io";
import { messageChain } from "../payments/transport";
import type { ToolFetch } from "./facilitator-client";
import type { Fetched } from "./fetched";
import type { ProbeRead } from "./g1-checks";
import { jsonHeaders, redirectOf } from "./pay-probe";

export const releaseTestUrl = (domain: string): string => `https://${domain}/v1/release-test`;

export async function probeRelease(
  fetch: ToolFetch,
  domain: string,
  preflightId: string,
): Promise<Fetched<ProbeRead>> {
  const url = releaseTestUrl(domain);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ preflightId, profile: "quick" }),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error: unknown) {
    return { ok: false, reason: `${url}: ${messageChain(error)}` };
  }
  await response.body?.cancel();
  const redirected = redirectOf(response);
  if (redirected !== null) {
    return { ok: false, reason: `${url}: ${redirected}` };
  }
  const { status, decoded, decodeError } = readChallenge(response);
  return { ok: true, value: { status, decoded, decodeError } };
}
