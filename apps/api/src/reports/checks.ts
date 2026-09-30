import { checkIds, checkStatuses, type CheckId, type CheckResult } from "@selo/core";
import { z } from "zod";
import type { ScenarioRow } from "../db/client";

const checkSchema = z.object({
  id: z.enum(checkIds),
  status: z.enum(checkStatuses),
  code: z.string(),
  blocking: z.boolean(),
  summary: z.string(),
  evidence: z.array(z.string()),
});

const observedSchema = z.looseObject({ check: checkSchema, durationMs: z.number() });

export function notRunCheck(id: CheckId): CheckResult {
  return {
    id,
    status: "INCONCLUSIVE",
    code: "NOT_RUN",
    blocking: true,
    summary: `The ${id} check did not run.`,
    evidence: [],
  };
}

function observed(row: ScenarioRow | undefined) {
  const parsed = observedSchema.safeParse(row?.observedJson);
  return parsed.success ? parsed.data : null;
}

export function scenarioCheck(rows: readonly ScenarioRow[], id: CheckId): CheckResult {
  const recorded = observed(rows.find((row) => row.scenarioKey === id));
  return recorded === null || recorded.check.id !== id ? notRunCheck(id) : recorded.check;
}

export function scenarioDurationMs(row: ScenarioRow): number | null {
  return observed(row)?.durationMs ?? null;
}

export function orderedChecks(rows: readonly ScenarioRow[]): readonly CheckResult[] {
  return checkIds.map((id) => scenarioCheck(rows, id));
}
