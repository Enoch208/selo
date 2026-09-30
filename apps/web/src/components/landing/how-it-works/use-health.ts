import { useEffect, useState } from "react";
import { getJson } from "../../../lib/api";
import { healthSchema } from "../../../lib/wire";

export type Health =
  | { readonly state: "checking" }
  | { readonly state: "up"; readonly roundTripMs: number }
  | { readonly state: "down" };

export function useHealth(): Health {
  const [health, setHealth] = useState<Health>({ state: "checking" });

  useEffect(() => {
    let live = true;
    const started = performance.now();
    void getJson("/health", healthSchema).then((result) => {
      if (!live) {
        return;
      }
      setHealth(
        result.ok
          ? { state: "up", roundTripMs: Math.round(performance.now() - started) }
          : { state: "down" },
      );
    });
    return () => {
      live = false;
    };
  }, []);

  return health;
}
