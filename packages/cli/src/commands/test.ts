import type { PayFlowDeps } from "@selo/api/pay-flow";
import type { ExitCode } from "../exit";
import { loadBody, loadContract } from "../files";
import {
  address,
  apiOrigin,
  flag,
  fromInvocationDir,
  id,
  method,
  network,
  optionalText,
  releaseId,
  targetUrl,
  text,
  UsageError,
  usdcMicros,
} from "../options";
import { runReleaseGate } from "../release-gate";
import type { ReleaseGateOptions } from "../release-plan";
import type { CommandContext } from "./auth";
import { parseOptions } from "./parse";

export interface PayerWallet {
  readonly payer: string;
  readonly schemeFor: PayFlowDeps["schemeFor"];
}

export interface TestContext extends CommandContext {
  readonly payerMnemonic: string | undefined;
  readonly wallet: (mnemonic: string) => PayerWallet;
  readonly now: () => Date;
  readonly stateDir: string;
  readonly stepSummaryFile: string | null;
}

async function readOptions(args: readonly string[]): Promise<ReleaseGateOptions> {
  const values = parseOptions(args, {
    api: { type: "string" },
    authorization: { type: "string" },
    url: { type: "string" },
    method: { type: "string" },
    body: { type: "string" },
    contract: { type: "string" },
    release: { type: "string" },
    network: { type: "string" },
    "max-usdc": { type: "string" },
    "pay-to": { type: "string" },
    "approve-mainnet": { type: "boolean", default: false },
    summary: { type: "string" },
    attestation: { type: "string" },
    resume: { type: "boolean", default: false },
  });
  const bodyFile = optionalText(values, "body");
  const summaryFile = optionalText(values, "summary");
  const attestationFile = optionalText(values, "attestation");
  const options: ReleaseGateOptions = {
    api: apiOrigin(values),
    authorizationId: id(values, "authorization"),
    url: targetUrl(values),
    method: method(values),
    body: bodyFile === null ? null : await loadBody(bodyFile),
    contract: await loadContract(text(values, "contract")),
    release: releaseId(values),
    network: network(values),
    maxPriceMicros: usdcMicros(values, "max-usdc"),
    payTo: address(values, "pay-to"),
    approveMainnet: flag(values, "approve-mainnet"),
    resume: flag(values, "resume"),
    summaryFile: summaryFile === null ? null : fromInvocationDir(summaryFile),
    attestationFile: attestationFile === null ? null : fromInvocationDir(attestationFile),
  };
  if (
    options.network === "algorand-mainnet" &&
    (!options.approveMainnet || options.payTo === null)
  ) {
    throw new UsageError(
      "--network mainnet needs --approve-mainnet and --pay-to <Selo's payTo address>",
    );
  }
  if (options.body !== null && options.method !== "POST") {
    throw new UsageError("--body is only allowed with --method POST");
  }
  return options;
}

function walletOf(ctx: TestContext): PayerWallet {
  if (ctx.payerMnemonic === undefined || ctx.payerMnemonic.trim() === "") {
    throw new UsageError(
      "SELO_PAYER_MNEMONIC is not set: export the dedicated, capped payer wallet",
    );
  }
  try {
    return ctx.wallet(ctx.payerMnemonic.trim());
  } catch {
    throw new UsageError("SELO_PAYER_MNEMONIC is not a valid Algorand mnemonic");
  }
}

export async function testCommand(ctx: TestContext, args: readonly string[]): Promise<ExitCode> {
  const options = await readOptions(args);
  const wallet = walletOf(ctx);
  return runReleaseGate(
    {
      fetch: ctx.fetch,
      schemeFor: wallet.schemeFor,
      payer: wallet.payer,
      now: ctx.now,
      out: ctx.out,
      stateDir: ctx.stateDir,
      stepSummaryFile: ctx.stepSummaryFile,
    },
    options,
  );
}
