import { describe, expect, it } from "vitest";
import { paymentTransitions, spendDelta } from "../src/transitions";
import { evaluateSpend } from "../src/spend-guard";
import { input } from "./support/spend-guard-fixture";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("A16 (pure): no sequence of guarded reservations exceeds the job cap", () => {
  it.each([1, 7, 42, 2026])("randomised reserve/settle/release/unresolve with seed %i", (seed) => {
    const random = seededRandom(seed);
    const maxSpendMicros = 3_000_000;
    let settledMicros = 0;
    let reservedMicros = 0;
    let unresolvedMicros = 0;
    const reservations: number[] = [];

    for (let step = 0; step < 5_000; step += 1) {
      const roll = random();
      if (roll < 0.5 || reservations.length === 0) {
        const amount = Math.floor(random() * 400_000) + 1;
        const result = evaluateSpend(
          input({
            job: { maxSpendMicros, settledMicros, reservedMicros, unresolvedMicros },
            scenarioMaxSpendMicros: maxSpendMicros,
            payment: { amountMicros: amount },
          }),
        );
        if (result.allowed) {
          reservedMicros += amount;
          reservations.push(amount);
        }
      } else {
        const amount = reservations.pop();
        if (amount === undefined) {
          continue;
        }
        const action = random();
        if (action < 0.34) {
          const delta = spendDelta(paymentTransitions.settle, amount);
          reservedMicros += delta.reservedMicros;
          settledMicros += delta.settledMicros;
        } else if (action < 0.67) {
          const delta = spendDelta(paymentTransitions.release, amount);
          reservedMicros += delta.reservedMicros;
        } else {
          const delta = spendDelta(paymentTransitions.markUnresolved, amount);
          reservedMicros += delta.reservedMicros;
          unresolvedMicros += delta.unresolvedMicros;
        }
      }
      expect(settledMicros + reservedMicros + unresolvedMicros).toBeLessThanOrEqual(maxSpendMicros);
    }
  });
});

describe("three reservations against a two-reservation cap", () => {
  it("three 0.05 reservations against a 0.10 cap: two allowed, the third denied", () => {
    const maxSpendMicros = 100_000;
    let reservedMicros = 0;
    const outcomes: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = evaluateSpend(
        input({
          job: { maxSpendMicros, settledMicros: 0, reservedMicros, unresolvedMicros: 0 },
          scenarioMaxSpendMicros: maxSpendMicros,
          payment: { amountMicros: 50_000 },
        }),
      );
      outcomes.push(result.allowed);
      if (result.allowed) {
        reservedMicros += 50_000;
      }
    }
    expect(outcomes).toEqual([true, true, false]);
    const third = evaluateSpend(
      input({
        job: { maxSpendMicros, settledMicros: 0, reservedMicros, unresolvedMicros: 0 },
        scenarioMaxSpendMicros: maxSpendMicros,
        payment: { amountMicros: 50_000 },
      }),
    );
    expect(third).toEqual({ allowed: false, reason: "JOB_BUDGET_EXCEEDED" });
  });
});
