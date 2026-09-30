import type { InconclusiveReason } from "@selo/core";
import { notRunCheck } from "../reports/checks";
import type { JobContext } from "./context";
import type { Scenario } from "./scenario";

export async function skipScenario(
  ctx: JobContext,
  scenario: Scenario,
  reason: InconclusiveReason | null,
): Promise<void> {
  if (reason !== null) {
    ctx.state.inconclusive(reason);
  }
  const check = ctx.state.record(notRunCheck(scenario.checkId));
  await scenario.evaluate(check, { skipped: reason ?? "not_applicable" });
}
