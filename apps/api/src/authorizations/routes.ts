import { Hono } from "hono";
import type { Db } from "../db/client";
import { pathId, readBody } from "../http/input";
import { createAuthorizationSchema } from "../http/schemas";
import { createAuthorization } from "./create";
import type { AuthorizationDeps } from "./deps";
import { currentAuthorization } from "./store";
import { verifyAuthorization } from "./verify";
import { toView } from "./view";

export function authorizationRoutes(db: Db, deps: AuthorizationDeps) {
  return new Hono()
    .post("/v1/authorizations", async (c) => {
      const input = await readBody(c, createAuthorizationSchema);
      return c.json(await createAuthorization(db, input), 201);
    })
    .post("/v1/authorizations/:id/verify", async (c) => {
      const id = pathId(c, "auth", "Authorization");
      return c.json(await verifyAuthorization(db, deps, id));
    })
    .get("/v1/authorizations/:id", async (c) => {
      const id = pathId(c, "auth", "Authorization");
      return c.json(toView(await currentAuthorization(db, id, new Date())));
    });
}
