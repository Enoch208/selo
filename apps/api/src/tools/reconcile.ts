import { createDb } from "../db/client";
import { loadReconcileEnv } from "../env";
import { unresolvedCount } from "../reconcile/candidates";
import { liveIndexerFetch } from "../reconcile/indexer";
import {
  indexerTimeoutMs,
  maxReconcileLimit,
  reconcileLimit,
  reconcileSucceeded,
  reportLine,
  summaryLine,
} from "../reconcile/report";
import { reconcileUnresolved } from "../reconcile/run";
import { fail, parseCli, say } from "./cli";

const usage = `Usage: reconcile [-- --limit <1-${String(maxReconcileLimit)}>]`;

const values = parseCli({ limit: { type: "string" } });
const limit = values === null ? null : reconcileLimit(values.limit);
if (limit === null) {
  fail("Unrecognised arguments or a limit outside the allowed range", usage);
} else {
  const env = loadReconcileEnv(process.env);
  const db = createDb(env.DATABASE_URL);
  try {
    say(`reconciling up to ${String(limit)} UNRESOLVED payments for ${env.operatingAddress}`);
    const reports = await reconcileUnresolved(
      {
        db,
        fetch: liveIndexerFetch,
        operatorAddress: env.operatingAddress,
        timeoutMs: indexerTimeoutMs,
      },
      limit,
    );
    for (const report of reports) {
      say(reportLine(report));
    }
    const remaining = await unresolvedCount(db);
    say(summaryLine(reports, remaining));
    if (!reconcileSucceeded(reports, remaining)) {
      fail("reconciliation incomplete: payments remain UNRESOLVED or failed to reconcile");
    }
  } finally {
    await db.$client.end();
  }
}
