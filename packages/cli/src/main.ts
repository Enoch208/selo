import { seloNetworks } from "@selo/api/networks";
import { createAvmPaymentScheme, operatingAddress } from "@selo/api/wallet";
import { runCli } from "./cli";
import { processOutput } from "./exit";
import type { CliFetch } from "./http";
import { fromInvocationDir } from "./options";

const requestTimeoutMs = 300_000;

const timedFetch: CliFetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(requestTimeoutMs) });

process.exitCode = await runCli(process.argv.slice(2), {
  fetch: timedFetch,
  out: processOutput,
  payerMnemonic: process.env.SELO_PAYER_MNEMONIC,
  wallet: (mnemonic) => ({
    payer: operatingAddress(mnemonic),
    schemeFor: (name) => createAvmPaymentScheme(mnemonic, seloNetworks[name].algodUrl),
  }),
  now: () => new Date(),
  stateDir: fromInvocationDir(".selo/runs"),
  stepSummaryFile: process.env.GITHUB_STEP_SUMMARY ?? null,
});
