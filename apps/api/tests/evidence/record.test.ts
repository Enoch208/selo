import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evidence } from "../../src/db/schema";
import { canonicalJson, sha256Hex } from "../../src/evidence/canonical";
import { EmptyEvidence, evidenceKinds, recordEvidence } from "../../src/evidence/record";
import { db, resetDatabaseBetweenTests } from "../support";
import { seedJob } from "../ledger/fixtures";

resetDatabaseBetweenTests();

const mnemonic = Array.from(
  { length: 25 },
  (_, index) => ["legal", "winner", "thank", "year", "wave"][index % 5],
).join(" ");

const signature = Buffer.concat([
  Buffer.from([0x82, 0xa3]),
  Buffer.from("sig"),
  Buffer.from([0xc4, 0x40]),
  Buffer.alloc(64, 9),
  Buffer.from([0xa3]),
  Buffer.from("txn"),
  Buffer.alloc(40, 3),
]).toString("base64");

const paymentHeader = Buffer.from(
  JSON.stringify({ x402Version: 2, payload: { paymentGroup: [signature], paymentIndex: 0 } }),
).toString("base64");

async function rawRows(jobId: string): Promise<string> {
  const rows = await db.execute(
    sql`select id, job_id, scenario_id, kind, sha256, sanitized_json::text as json from evidence where job_id = ${jobId}`,
  );
  return JSON.stringify(rows);
}

describe("recordEvidence", () => {
  it("stores the sanitized value with the sha256 of its canonical form", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const value = { b: 2, a: { authorization: "Bearer x" } };
    const id = await recordEvidence(db, {
      jobId: job.jobId,
      scenarioId: job.scenarioIds[0] ?? null,
      kind: "paid_response",
      value,
    });
    const [row] = await db.select().from(evidence).where(eq(evidence.id, id));
    const stored = { a: { authorization: `sha256:${sha256Hex("Bearer x")}` }, b: 2 };
    expect(row).toMatchObject({
      jobId: job.jobId,
      scenarioId: job.scenarioIds[0],
      kind: "paid_response",
      sanitizedJson: stored,
      sha256: sha256Hex(canonicalJson(stored)),
    });
    expect(id).toMatch(/^evd_/);
  });

  it("accepts job-level evidence without a scenario", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const id = await recordEvidence(db, {
      jobId: job.jobId,
      scenarioId: null,
      kind: "inbound_settlement",
      value: { txId: "TX" },
    });
    const [row] = await db.select().from(evidence).where(eq(evidence.id, id));
    expect(row?.scenarioId).toBeNull();
  });

  it.each([null, undefined])("rejects an empty value (%s) before inserting", async (value) => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    await expect(
      recordEvidence(db, { jobId: job.jobId, scenarioId: null, kind: "paid_response", value }),
    ).rejects.toBeInstanceOf(EmptyEvidence);
    expect(await db.select().from(evidence).where(eq(evidence.jobId, job.jobId))).toEqual([]);
  });

  it("declares every evidence kind", () => {
    expect(evidenceKinds).toEqual([
      "target_challenge",
      "paid_response",
      "downstream_payment",
      "inbound_settlement",
      "replay_response",
      "catalog_record",
      "response_contract",
      "authorization_snapshot",
    ]);
  });

  it("A22 (evidence): a mnemonic or payment signature placed in any field never reaches the evidence table", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const placements: readonly unknown[] = [
      { note: mnemonic },
      { log: [`boot with ${mnemonic}`] },
      { mnemonic },
      { headers: { "PAYMENT-SIGNATURE": paymentHeader } },
      { headers: { "X-PAYMENT": paymentHeader } },
      { request: { replay: paymentHeader } },
      { payload: { paymentGroup: [signature], paymentIndex: 0 } },
      {
        deep: {
          a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: signature } } } } } } } } } },
        },
      },
      [signature, mnemonic],
      signature,
    ];
    for (const value of placements) {
      await recordEvidence(db, {
        jobId: job.jobId,
        scenarioId: null,
        kind: "downstream_payment",
        value,
      });
    }
    const raw = await rawRows(job.jobId);
    expect(raw).toContain("sha256:");
    for (const secret of [mnemonic, signature, paymentHeader, "legal winner thank"]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).not.toContain(signature.slice(0, 40));
  });
});
