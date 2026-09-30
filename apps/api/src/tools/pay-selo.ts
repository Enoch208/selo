import algosdk from "algosdk";
import { z } from "zod";
import { seloNetworks } from "../payments/networks";
import { messageChain } from "../payments/transport";
import { createAvmPaymentScheme, operatingAddress } from "../payments/wallet";
import { fail, fromInvocationDir, parseCli, say } from "./cli";
import { writeEvidence } from "./evidence-file";
import { g2EvidenceResponse } from "./g2-evidence";
import { runPayment, type PayFlowOutcome } from "./pay-flow";
import { payIdempotencyKey } from "./pay-idempotency";

const usage =
  "Usage: pay:selo -- --api <https base url> --preflight <id> [--pay-to <address>] [--expected-status 200] [--idempotency-key <key>] [--out <dir>] [--mainnet-i-have-approval --pay-to <address>]";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

const values = parseCli({
  api: { type: "string" },
  preflight: { type: "string" },
  "pay-to": { type: "string" },
  "expected-status": { type: "string" },
  "idempotency-key": { type: "string" },
  out: { type: "string" },
  "mainnet-i-have-approval": { type: "boolean", default: false },
});

const mnemonicSchema = z.object({
  SELO_CLIENT_MNEMONIC: z.string().trim().min(1),
  SELO_OPERATOR_MNEMONIC: z.string().trim().min(1).optional(),
});

function apiBase(value: string | undefined): string | null {
  if (value === undefined || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  const allowed =
    url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname));
  return allowed ? url.origin : null;
}

function expectedStatus(value: string | undefined): number | null | undefined {
  if (value === undefined) {
    return null;
  }
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

async function finish(outcome: PayFlowOutcome, out: string | undefined): Promise<void> {
  if (outcome.kind === "refused") {
    fail(outcome.message);
    return;
  }
  if (out !== undefined && outcome.record !== null) {
    try {
      const path = await writeEvidence(
        fromInvocationDir(out),
        "g2-orchestrator-roundtrip.json",
        {
          outcome: outcome.kind,
          ...outcome.record,
          response: g2EvidenceResponse(outcome.record.response),
        },
        new Date(),
      );
      say(`saved ${path}`);
    } catch (error: unknown) {
      process.stderr.write(`could not save evidence: ${messageChain(error)}\n`);
    }
  }
  if (outcome.kind === "unknown") {
    fail(outcome.message);
    process.exitCode = 2;
    return;
  }
  const status = outcome.record.status ?? 0;
  process.exitCode = status >= 200 && status < 300 ? 0 : 1;
}

interface PayRequest {
  readonly api: string;
  readonly preflightId: string;
  readonly expectedStatus: number | null;
  readonly expectedPayTo: string | null;
  readonly approvedMainnet: boolean;
  readonly explicitKey: string | undefined;
  readonly out: string | undefined;
}

async function pay(secrets: z.infer<typeof mnemonicSchema>, request: PayRequest): Promise<void> {
  const { api, preflightId, expectedStatus, expectedPayTo, approvedMainnet } = request;
  let outcome: PayFlowOutcome;
  try {
    const mnemonic = secrets.SELO_CLIENT_MNEMONIC;
    const operator = secrets.SELO_OPERATOR_MNEMONIC;
    const payer = operatingAddress(mnemonic);
    const idempotencyKey = payIdempotencyKey(preflightId, payer, request.explicitKey);
    if (idempotencyKey === null) {
      fail("--idempotency-key must be 8-128 characters of A-Z, a-z, 0-9, _ or -", usage);
      return;
    }
    say(`idempotency-key ${idempotencyKey} (reuse it with --idempotency-key on any rerun)`);
    outcome = await runPayment(
      {
        fetch,
        payer,
        seloWallets: operator === undefined ? [] : [operatingAddress(operator)],
        schemeFor: (name) => createAvmPaymentScheme(mnemonic, seloNetworks[name].algodUrl),
        now: () => new Date(),
        write: say,
      },
      { api, preflightId, expectedStatus, approvedMainnet, expectedPayTo, idempotencyKey },
    );
  } catch (error: unknown) {
    fail(`${messageChain(error)}; nothing was sent`);
    return;
  }
  await finish(outcome, request.out);
}

const env = mnemonicSchema.safeParse(process.env);
if (values === null) {
  fail("Unrecognised or incomplete arguments", usage);
} else if (!env.success) {
  fail("SELO_CLIENT_MNEMONIC is not set (run account:new -- --role client first)");
} else {
  const api = apiBase(values.api);
  const status = expectedStatus(values["expected-status"]);
  const preflightId = values.preflight;
  const payTo = values["pay-to"];
  if (api === null) {
    fail("--api must be an https URL (http only for localhost)", usage);
  } else if (preflightId === undefined || preflightId === "") {
    fail("--preflight is required", usage);
  } else if (status === undefined) {
    fail("--expected-status must be an HTTP status code", usage);
  } else if (payTo !== undefined && !algosdk.isValidAddress(payTo)) {
    fail("--pay-to must be an Algorand address", usage);
  } else if (values["mainnet-i-have-approval"] && payTo === undefined) {
    fail("--mainnet-i-have-approval requires --pay-to <expected payTo address>", usage);
  } else {
    await pay(env.data, {
      api,
      preflightId,
      expectedStatus: status,
      expectedPayTo: payTo ?? null,
      approvedMainnet: values["mainnet-i-have-approval"],
      explicitKey: values["idempotency-key"],
      out: values.out,
    });
  }
}
