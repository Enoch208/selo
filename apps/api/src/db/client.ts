import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  return drizzle({ client: postgres(databaseUrl), schema });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export type TargetAuthorizationRow = typeof schema.targetAuthorizations.$inferSelect;
export type PreflightRow = typeof schema.preflights.$inferSelect;
export type ReleaseJobRow = typeof schema.releaseJobs.$inferSelect;
export type ScenarioRow = typeof schema.scenarios.$inferSelect;
export type DownstreamPaymentRow = typeof schema.downstreamPayments.$inferSelect;
export type EvidenceRow = typeof schema.evidence.$inferSelect;
