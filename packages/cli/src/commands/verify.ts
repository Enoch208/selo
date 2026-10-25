import { readFile } from "node:fs/promises";
import type { AttestationKey } from "@selo/core";
import { parseKeySet, verifyAttestation } from "../attestation";
import { exitCodes, type ExitCode } from "../exit";
import { callApi } from "../http";
import { fromInvocationDir, method, releaseId, targetUrl, text, UsageError } from "../options";
import type { CommandContext } from "./auth";
import { parseOptions } from "./parse";

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(fromInvocationDir(path), "utf8"));
  } catch {
    return null;
  }
}

async function trustedKeys(
  ctx: CommandContext,
  source: string,
): Promise<readonly AttestationKey[] | string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    if (!source.startsWith("https://")) {
      throw new UsageError("--keys must be an https URL or a file");
    }
    const answer = await callApi(ctx.fetch, source, "GET");
    if (answer.kind === "unreachable" || answer.status !== 200) {
      return `could not read the keys at ${source}`;
    }
    return parseKeySet(answer.body) ?? `${source} is not a Selo key set`;
  }
  return parseKeySet(await readJsonFile(source)) ?? `${source} is not a readable Selo key set`;
}

const verdictExit = {
  PASS: exitCodes.pass,
  FAIL: exitCodes.fail,
  INCONCLUSIVE: exitCodes.inconclusive,
};

export async function verifyCommand(
  ctx: CommandContext,
  args: readonly string[],
): Promise<ExitCode> {
  const values = parseOptions(args, {
    attestation: { type: "string" },
    keys: { type: "string" },
    release: { type: "string" },
    url: { type: "string" },
    method: { type: "string" },
  });
  const expected = { release: releaseId(values), url: targetUrl(values), method: method(values) };
  const attestationFile = text(values, "attestation");
  const keys = await trustedKeys(ctx, text(values, "keys"));
  if (typeof keys === "string") {
    ctx.out.error(`not verified: ${keys}`);
    return exitCodes.inconclusive;
  }
  const raw = await readJsonFile(attestationFile);
  const verification = verifyAttestation(raw, keys, expected);
  if (!verification.ok) {
    ctx.out.error(`not verified: ${verification.reason}`);
    return exitCodes.inconclusive;
  }
  const { attested } = verification;
  ctx.out.line(`verified    signature by ${attested.keyId} (issuer ${attested.issuer})`);
  ctx.out.line(`release     ${attested.release} (asserted by the caller when tested)`);
  ctx.out.line(`target      ${expected.method} ${expected.url}`);
  ctx.out.line(`job         ${attested.jobId}`);
  ctx.out.line(`verdict     ${attested.verdict}`);
  ctx.out.line(`inbound     ${attested.inboundTxId ?? "none"}`);
  ctx.out.line(`downstream  ${attested.downstreamTxIds.join(", ") || "none"}`);
  return verdictExit[attested.verdict];
}
