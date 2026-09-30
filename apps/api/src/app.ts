import type { ApiError } from "@selo/core";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthorizationDeps } from "./authorizations/deps";
import { authorizationRoutes } from "./authorizations/routes";
import type { Db } from "./db/client";
import { HttpError } from "./http/errors";
import type { IdentityConfig } from "./identity/content";
import { identityRoutes } from "./identity/routes";
import type { PreflightDeps } from "./preflight/deps";
import { preflightRoutes } from "./preflight/routes";
import type { ReleaseDeps } from "./release/deps";
import { releaseRoutes } from "./release/routes";
import { reportRoutes } from "./reports/routes";

export interface AppDeps {
  readonly authorizations: AuthorizationDeps;
  readonly release?: ReleaseDeps;
  readonly preflight?: PreflightDeps;
  readonly identity?: IdentityConfig;
}

export const maxJsonBodyBytes = 64 * 1024;

const jsonBodyLimit = bodyLimit({
  maxSize: maxJsonBodyBytes,
  onError: (c) =>
    c.json<ApiError>(
      {
        error: "PAYLOAD_TOO_LARGE",
        message: `Request body exceeds ${String(maxJsonBodyBytes)} bytes`,
      },
      413,
    ),
});

export function createApp(db: Db, deps: AppDeps) {
  const app = new Hono()
    .use(jsonBodyLimit)
    .get("/health", async (c) => {
      await db.execute(sql`select 1`);
      return c.json({ status: "ok" });
    })
    .route("/", authorizationRoutes(db, deps.authorizations))
    .route("/", reportRoutes(db));
  if (deps.release !== undefined) {
    app.route("/", releaseRoutes(db, deps.release));
  }
  if (deps.preflight !== undefined) {
    app.route("/", preflightRoutes(db, deps.preflight));
  }
  if (deps.identity !== undefined) {
    app.route("/", identityRoutes(deps.identity));
  }
  return app
    .notFound((c) =>
      c.json<ApiError>(
        { error: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` },
        404,
      ),
    )
    .onError((error, c) => {
      if (error instanceof HttpError) {
        return c.json(error.toBody(), error.status);
      }
      process.stderr.write(`${error.stack ?? error.message}\n`);
      return c.json<ApiError>({ error: "INTERNAL", message: "Internal server error" }, 500);
    });
}
