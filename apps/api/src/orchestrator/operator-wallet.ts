import { formatMicros, type AlgorandRequirement } from "@selo/core";
import { checkFunding } from "../payments/wallet-balance";
import type { JobContext } from "./context";
import { evidenceFor } from "./evidence";
import { alert } from "./log";
import { concludePaid } from "./paid-outcome";

export async function operatorWalletBlocks(
  ctx: JobContext,
  requirement: AlgorandRequirement,
): Promise<boolean> {
  const { network } = ctx.deps;
  const funding = await checkFunding(
    ctx.deps.walletBalance,
    network.usdcAssetId,
    requirement.amountMicros,
  );
  if (funding.kind === "funded") {
    return false;
  }
  const scenario = ctx.scenarios.paid_delivery;
  const amountUsdc = formatMicros(requirement.amountMicros);
  await scenario.advance("POLICY_CHECKED");
  ctx.state.inconclusive(funding.kind === "unfunded" ? "INTERNAL_ERROR" : "NETWORK_UNAVAILABLE");
  const event = funding.kind === "unfunded" ? "operator_wallet_low" : "operator_wallet_unreachable";
  alert(event, ctx.job.id, { amountUsdc, detail: funding.detail });
  const evidenceId = await evidenceFor(ctx, scenario, "downstream_payment", {
    operatorWallet: funding.kind,
    detail: funding.detail,
    amountUsdc,
    network: network.caip2,
    asset: network.usdcAssetId,
    signed: false,
  });
  await concludePaid(
    ctx,
    { kind: "operator_wallet", problem: funding.kind, detail: funding.detail },
    [evidenceId],
    null,
  );
  return true;
}
