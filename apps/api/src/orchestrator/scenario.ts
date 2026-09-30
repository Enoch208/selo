import {
  assertScenarioTransition,
  checkIds,
  type CheckId,
  type CheckResult,
  type ScenarioStatus,
} from "@selo/core";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { scenarios } from "../db/schema";
import { sanitize } from "../evidence/sanitize";
import { newId } from "../ids";
import { logEvent } from "./log";

export interface ScenarioScope {
  readonly db: Db;
  readonly jobId: string;
  readonly targetOrigin: string;
}

export class ScenarioMovedUnderneath extends Error {
  override readonly name = "ScenarioMovedUnderneath";
}

export class Scenario {
  readonly id: string;
  readonly checkId: CheckId;
  readonly operationId: string;
  readonly #scope: ScenarioScope;
  #status: ScenarioStatus = "PLANNED";
  #startedMs: number | null = null;

  constructor(scope: ScenarioScope, id: string, checkId: CheckId) {
    this.#scope = scope;
    this.id = id;
    this.checkId = checkId;
    this.operationId = `${scope.jobId}:${checkId}`;
  }

  get status(): ScenarioStatus {
    return this.#status;
  }

  get evaluated(): boolean {
    return this.#status === "EVALUATED";
  }

  async advance(
    to: ScenarioStatus,
    extra: { readonly observedJson?: unknown; readonly failureCode?: string | null } = {},
  ): Promise<void> {
    const from = this.#status;
    assertScenarioTransition(from, to);
    const starting = this.#startedMs === null && to !== "EVALUATED";
    const [moved] = await this.#scope.db
      .update(scenarios)
      .set({
        ...extra,
        status: to,
        ...(starting ? { startedAt: sql`clock_timestamp()` } : {}),
        ...(to === "EVALUATED" ? { completedAt: sql`clock_timestamp()` } : {}),
      })
      .where(and(eq(scenarios.id, this.id), eq(scenarios.status, from)))
      .returning({ id: scenarios.id });
    if (moved === undefined) {
      throw new ScenarioMovedUnderneath(`Scenario ${this.id} left ${from} before moving to ${to}`);
    }
    if (starting) {
      this.#startedMs = Date.now();
    }
    this.#status = to;
  }

  async attempt(): Promise<void> {
    await this.#scope.db
      .update(scenarios)
      .set({ attemptCount: sql`${scenarios.attemptCount} + 1` })
      .where(eq(scenarios.id, this.id));
  }

  async evaluate(check: CheckResult, observation: unknown): Promise<void> {
    const durationMs = this.#startedMs === null ? 0 : Date.now() - this.#startedMs;
    const failureCode = check.status === "PASS" ? null : check.code;
    await this.advance("EVALUATED", {
      observedJson: sanitize({ check, observation, durationMs }),
      failureCode,
    });
    logEvent({
      event: "scenario_evaluated",
      jobId: this.#scope.jobId,
      scenarioId: this.id,
      operationId: this.operationId,
      targetOrigin: this.#scope.targetOrigin,
      durationMs,
      status: check.status,
      failureCode,
    });
  }
}

export type ScenarioSet = Readonly<Record<CheckId, Scenario>>;

export async function planScenarios(
  scope: ScenarioScope,
  expected: Readonly<Record<CheckId, unknown>>,
): Promise<ScenarioSet> {
  const plan = (checkId: CheckId): Scenario => new Scenario(scope, newId("scn"), checkId);
  const set: ScenarioSet = {
    handshake: plan("handshake"),
    paid_delivery: plan("paid_delivery"),
    response_contract: plan("response_contract"),
    discovery_contract: plan("discovery_contract"),
    retry_safety: plan("retry_safety"),
  };
  await scope.db.insert(scenarios).values(
    checkIds.map((checkId) => ({
      id: set[checkId].id,
      jobId: scope.jobId,
      scenarioKey: checkId,
      operationId: set[checkId].operationId,
      blocking: true,
      expectedJson: sanitize(expected[checkId]),
    })),
  );
  return set;
}
