import { authCommand } from "./commands/auth";
import { preflightCommand } from "./commands/preflight";
import { testCommand, type TestContext } from "./commands/test";
import { exitCodes, type ExitCode } from "./exit";
import { UsageError } from "./options";

export const usage = `selo: a payment-aware release gate for x402 endpoints on Algorand

Usage:
  selo auth create  --api <url> --url <target> --method GET|POST --project <name> --contact <email>
  selo auth verify  --api <url> --authorization <auth_id>
  selo auth status  --api <url> --authorization <auth_id>
  selo preflight    --api <url> --authorization <auth_id> --url <target> --method GET|POST
                    [--body <file.json>]
  selo test         --api <url> --authorization <auth_id> --url <target> --method GET|POST
                    [--body <file.json>] --contract <file.json> --release <id>
                    --network testnet|mainnet --max-usdc <amount>
                    [--pay-to <Selo payTo>] [--approve-mainnet] [--summary <file.json>] [--resume]

selo test runs a free preflight, shows every price, then pays Selo once with the wallet in
SELO_PAYER_MNEMONIC. It never retries a payment on its own. If an outcome is unconfirmed it
records the attempt in .selo/runs/<release>.json and refuses to pay again until you resume it.

Environment:
  SELO_PAYER_MNEMONIC   the dedicated, capped payer wallet (selo test only; never printed)
  GITHUB_STEP_SUMMARY   when set, a sanitized gate summary is appended to it

Exit codes:
  0  PASS on every release check, fully evidenced
  1  FAIL proven by a release check
  2  INCONCLUSIVE, unconfirmed payment, missing or inconsistent report, transient failure
  3  invalid input, authorization missing, preflight ineligible, payment not approved
`;

const helpFlags = new Set(["help", "--help", "-h"]);

async function dispatch(ctx: TestContext, args: readonly string[]): Promise<ExitCode> {
  const [command, ...rest] = args;
  if (command === undefined || helpFlags.has(command) || rest.some((arg) => helpFlags.has(arg))) {
    ctx.out.line(usage);
    return exitCodes.pass;
  }
  if (command === "auth") {
    const [sub, ...tail] = rest;
    return authCommand(ctx, sub, tail);
  }
  if (command === "preflight") {
    return preflightCommand(ctx, rest);
  }
  if (command === "test") {
    return testCommand(ctx, rest);
  }
  throw new UsageError(`unknown command ${command}`);
}

export async function runCli(argv: readonly string[], ctx: TestContext): Promise<ExitCode> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  try {
    return await dispatch(ctx, args);
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      ctx.out.error(`${error.message} (run selo --help)`);
      return exitCodes.refused;
    }
    const reason = error instanceof Error ? error.message : String(error);
    ctx.out.error(`selo stopped unexpectedly, the release is not proven: ${reason}`);
    return exitCodes.inconclusive;
  }
}
