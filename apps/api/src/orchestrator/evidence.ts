import { recordEvidence, type EvidenceKind } from "../evidence/record";
import type { JobContext } from "./context";
import type { Scenario } from "./scenario";

export function evidenceFor(
  ctx: JobContext,
  scenario: Scenario | null,
  kind: EvidenceKind,
  value: unknown,
): Promise<string> {
  return recordEvidence(ctx.db, {
    jobId: ctx.job.id,
    scenarioId: scenario?.id ?? null,
    kind,
    value,
  });
}
