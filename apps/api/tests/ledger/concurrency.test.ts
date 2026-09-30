import { describe, expect, it } from "vitest";
import { jobBooks, type JobBooks } from "../../src/ledger/books";
import { reserveDownstream } from "../../src/ledger/reserve";
import {
  markDownstreamUnresolved,
  releaseDownstream,
  settleDownstream,
} from "../../src/ledger/transitions";
import { db, resetDatabaseBetweenTests } from "../support";
import { now, reserveInput, seedJob, separateConnections, type SeededJob } from "./fixtures";

resetDatabaseBetweenTests();

const connections = separateConnections(3);

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function expectBalancedBooks(jobId: string): Promise<JobBooks> {
  const books = await jobBooks(db, jobId);
  expect(books.counters).toEqual({
    settled: books.sums.settled,
    reserved: books.sums.reserved,
    unresolved: books.sums.unresolved,
  });
  expect(
    books.counters.settled + books.counters.reserved + books.counters.unresolved,
  ).toBeLessThanOrEqual(books.maxSpendMicros);
  return books;
}

function reserveOn(job: SeededJob, amountMicros: number, scenarioIndex: number) {
  const scenarioId = job.scenarioIds[scenarioIndex % job.scenarioIds.length] ?? "";
  return reserveInput(job, amountMicros, { scenarioId });
}

describe("A16: total spend never exceeds the job cap under concurrent scenario attempts", () => {
  it("A16: three parallel 0.05 reservations against a 0.10 job reserve exactly two", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000, scenarios: 3 });
    const results = await Promise.all(
      connections.map((connection, index) =>
        reserveDownstream(connection, reserveOn(job, 50_000, index)),
      ),
    );
    expect(results.filter((result) => result.reserved)).toHaveLength(2);
    expect(results.filter((result) => !result.reserved)).toEqual([
      { reserved: false, reason: "JOB_BUDGET_EXCEEDED" },
    ]);
    const books = await expectBalancedBooks(job.jobId);
    expect(books.counters.reserved).toBe(100_000);
  });

  it("A16: thirty parallel mixed-size reservations against 0.50 never overspend", async () => {
    const job = await seedJob({ maxSpendMicros: 500_000, scenarios: 5 });
    const amounts = Array.from({ length: 30 }, (_, index) => ((index % 5) + 1) * 13_000);
    const results = await Promise.all(
      amounts.map((amount, index) => reserveDownstream(db, reserveOn(job, amount, index))),
    );
    const approved = amounts.filter((_, index) => results[index]?.reserved === true);
    const books = await expectBalancedBooks(job.jobId);
    expect(approved.reduce((total, amount) => total + amount, 0)).toBe(books.sums.reserved);
    expect(books.sums.reserved).toBeLessThanOrEqual(500_000);
    expect(books.sums.reserved).toBeGreaterThan(500_000 - 65_000);
    for (const result of results) {
      if (!result.reserved) {
        expect(result.reason).toBe("JOB_BUDGET_EXCEEDED");
      }
    }
  });

  it.each([1, 7, 42, 2026])(
    "A16: randomised reserve/settle/release/unresolve interleaving with seed %i",
    async (seed) => {
      const random = seededRandom(seed);
      const job = await seedJob({ maxSpendMicros: 500_000, scenarios: 4 });
      const live: string[] = [];
      const pick = <T>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      let txCounter = 0;
      for (let round = 0; round < 8; round += 1) {
        const operations = Array.from({ length: 24 }, (_, index) => {
          const target = pick(live);
          const roll = random();
          if (roll < 0.6 || target === undefined) {
            const amount = Math.floor(random() * 90_000) + 1;
            return reserveDownstream(db, reserveOn(job, amount, index)).then((result) => {
              if (result.reserved) {
                live.push(result.paymentId);
              }
            });
          }
          const requestedAt = new Date(now.getTime() + round * 1_000 + index);
          if (roll < 0.78) {
            txCounter += 1;
            return settleDownstream(db, target, {
              txId: `TX-${String(seed)}-${String(txCounter)}`,
              requestedAt,
            });
          }
          if (roll < 0.97) {
            return releaseDownstream(db, target, { reason: "randomised", requestedAt });
          }
          return markDownstreamUnresolved(db, target, { reason: "randomised", requestedAt });
        });
        await Promise.all(operations);
        await expectBalancedBooks(job.jobId);
      }
      const books = await expectBalancedBooks(job.jobId);
      expect(books.sums.settled + books.sums.released).toBeGreaterThan(0);
    },
  );
});
