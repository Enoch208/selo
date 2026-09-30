import { describe, expect, it } from "vitest";
import { scenarioStatuses, type ScenarioStatus } from "../src/contract";
import {
  assertScenarioTransition,
  isLegalScenarioTransition,
  scenarioTransitions,
} from "../src/transitions";

const expectedScenarioEdges: readonly (readonly [ScenarioStatus, ScenarioStatus])[] = [
  ["PLANNED", "POLICY_CHECKED"],
  ["PLANNED", "EVALUATED"],
  ["POLICY_CHECKED", "RESERVED"],
  ["POLICY_CHECKED", "REQUESTING"],
  ["POLICY_CHECKED", "EVALUATED"],
  ["RESERVED", "REQUESTING"],
  ["RESERVED", "EVALUATED"],
  ["REQUESTING", "SETTLED"],
  ["REQUESTING", "REJECTED"],
  ["REQUESTING", "TIMEOUT_UNRESOLVED"],
  ["REQUESTING", "EVALUATED"],
  ["SETTLED", "EVALUATED"],
  ["REJECTED", "EVALUATED"],
  ["TIMEOUT_UNRESOLVED", "EVALUATED"],
];

describe("scenario transitions", () => {
  it("permits exactly the documented edges and nothing else", () => {
    const legal = scenarioStatuses.flatMap((from) =>
      scenarioStatuses
        .filter((to) => isLegalScenarioTransition(from, to))
        .map((to) => `${from}->${to}`),
    );
    const expected = expectedScenarioEdges.map(([from, to]) => `${from}->${to}`);
    expect(legal.sort()).toEqual(expected.sort());
  });

  it("asserts silently for legal edges and throws for illegal ones", () => {
    for (const [from, to] of expectedScenarioEdges) {
      expect(() => {
        assertScenarioTransition(from, to);
      }).not.toThrow();
    }
    expect(() => {
      assertScenarioTransition("PLANNED", "SETTLED");
    }).toThrow("Illegal scenario transition PLANNED -> SETTLED");
  });

  it("EVALUATED has no outgoing edges", () => {
    for (const to of scenarioStatuses) {
      expect(isLegalScenarioTransition("EVALUATED", to)).toBe(false);
    }
  });

  it("exposes the raw table", () => {
    expect(scenarioTransitions.length).toBe(expectedScenarioEdges.length);
  });
});
