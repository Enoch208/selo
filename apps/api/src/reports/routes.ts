import type { ApiError } from "@selo/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/client";
import { releaseJobs } from "../db/schema";
import { sha256Hex } from "../ids";
import { buildReport } from "./build";
import { isReportToken } from "./token";

const privateReportHeaders = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const notFound: ApiError = { error: "NOT_FOUND", message: "Report not found" };

async function jobIdForToken(db: Db, token: string): Promise<string | null> {
  if (!isReportToken(token)) {
    return null;
  }
  const [row] = await db
    .select({ id: releaseJobs.id })
    .from(releaseJobs)
    .where(
      and(
        eq(releaseJobs.reportTokenHash, sha256Hex(token)),
        eq(releaseJobs.status, "REPORT_WRITTEN"),
      ),
    );
  return row?.id ?? null;
}

export function reportRoutes(db: Db) {
  return new Hono().get("/v1/reports/:token", async (c) => {
    for (const [name, value] of Object.entries(privateReportHeaders)) {
      c.header(name, value);
    }
    const jobId = await jobIdForToken(db, c.req.param("token"));
    if (jobId === null) {
      return c.json(notFound, 404);
    }
    return c.json(await buildReport(db, jobId));
  });
}
