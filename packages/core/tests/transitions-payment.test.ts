import { describe, expect, it } from "vitest";
import { paymentStatuses } from "../src/contract";
import {
  assertPaymentTransition,
  isLegalPaymentTransition,
  paymentTransitions,
  spendDelta,
} from "../src/transitions";

const expectedPaymentEdges = [
  "RESERVED->SETTLED",
  "RESERVED->RELEASED",
  "RESERVED->UNRESOLVED",
  "UNRESOLVED->SETTLED",
  "UNRESOLVED->RELEASED",
];

describe("payment transitions", () => {
  it("permits exactly the documented edges", () => {
    const legal = paymentStatuses.flatMap((from) =>
      paymentStatuses
        .filter((to) => isLegalPaymentTransition(from, to))
        .map((to) => `${from}->${to}`),
    );
    expect(legal.sort()).toEqual([...expectedPaymentEdges].sort());
  });

  it("names each transition exactly as specified", () => {
    expect(paymentTransitions.settle).toEqual({ from: "RESERVED", to: "SETTLED" });
    expect(paymentTransitions.release).toEqual({ from: "RESERVED", to: "RELEASED" });
    expect(paymentTransitions.markUnresolved).toEqual({ from: "RESERVED", to: "UNRESOLVED" });
    expect(paymentTransitions.reconcileSettled).toEqual({ from: "UNRESOLVED", to: "SETTLED" });
    expect(paymentTransitions.reconcileReleased).toEqual({ from: "UNRESOLVED", to: "RELEASED" });
  });

  it("throws for illegal transitions", () => {
    expect(() => {
      assertPaymentTransition("SETTLED", "RELEASED");
    }).toThrow(RangeError);
    expect(() => {
      assertPaymentTransition("RELEASED", "RESERVED");
    }).toThrow("Illegal payment transition RELEASED -> RESERVED");
  });

  describe("spendDelta", () => {
    it("settle moves reserved into settled", () => {
      expect(spendDelta(paymentTransitions.settle, 400_000)).toEqual({
        reservedMicros: -400_000,
        settledMicros: 400_000,
        unresolvedMicros: 0,
      });
    });

    it("release frees reserved capacity", () => {
      expect(spendDelta(paymentTransitions.release, 400_000)).toEqual({
        reservedMicros: -400_000,
        settledMicros: 0,
        unresolvedMicros: 0,
      });
    });

    it("markUnresolved moves reserved into unresolved", () => {
      expect(spendDelta(paymentTransitions.markUnresolved, 400_000)).toEqual({
        reservedMicros: -400_000,
        settledMicros: 0,
        unresolvedMicros: 400_000,
      });
    });

    it("reconcileSettled moves unresolved into settled", () => {
      expect(spendDelta(paymentTransitions.reconcileSettled, 400_000)).toEqual({
        reservedMicros: 0,
        settledMicros: 400_000,
        unresolvedMicros: -400_000,
      });
    });

    it("reconcileReleased clears unresolved", () => {
      expect(spendDelta(paymentTransitions.reconcileReleased, 400_000)).toEqual({
        reservedMicros: 0,
        settledMicros: 0,
        unresolvedMicros: -400_000,
      });
    });

    it("throws on an illegal pair", () => {
      expect(() => spendDelta({ from: "SETTLED", to: "RELEASED" }, 1)).toThrow(RangeError);
    });

    it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
      "throws on invalid amount %s",
      (amount) => {
        expect(() => spendDelta(paymentTransitions.settle, amount)).toThrow(RangeError);
      },
    );
  });
});
