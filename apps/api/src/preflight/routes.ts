import { Hono } from "hono";
import type { Db } from "../db/client";
import { pathId, readBody } from "../http/input";
import type { PreflightDeps } from "./deps";
import { runPreflight } from "./run";
import { preflightBodySchema } from "./schemas";
import { findPreflight } from "./store";
import { ineligible, rejectionStatus, toResponse } from "./view";

export function preflightRoutes(db: Db, deps: PreflightDeps) {
  return new Hono()
    .post("/v1/preflight", async (c) => {
      const input = await readBody(c, preflightBodySchema);
      const run = await runPreflight(db, deps, input);
      if (run.kind === "refused") {
        return c.json(ineligible(run.reason, null), rejectionStatus(run.reason));
      }
      const { row } = run;
      const response = toResponse(row, deps.seloPriceMicros);
      return response.eligible
        ? c.json(response, 201)
        : c.json(response, rejectionStatus(response.reason));
    })
    .get("/v1/preflight/:id", async (c) => {
      const id = pathId(c, "pfl", "Preflight");
      return c.json(toResponse(await findPreflight(db, id), deps.seloPriceMicros));
    });
}
