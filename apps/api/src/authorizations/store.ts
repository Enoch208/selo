import { and, eq } from "drizzle-orm";
import type { Db, TargetAuthorizationRow } from "../db/client";
import { targetAuthorizations } from "../db/schema";
import { notFound } from "../http/errors";
import { hasLapsed } from "./view";

export async function findAuthorization(db: Db, id: string): Promise<TargetAuthorizationRow> {
  const [row] = await db.select().from(targetAuthorizations).where(eq(targetAuthorizations.id, id));
  if (row === undefined) {
    throw notFound("Authorization", id);
  }
  return row;
}

export async function currentAuthorization(
  db: Db,
  id: string,
  now: Date,
): Promise<TargetAuthorizationRow> {
  const row = await findAuthorization(db, id);
  if (!hasLapsed(row, now)) {
    return row;
  }
  const [expired] = await db
    .update(targetAuthorizations)
    .set({ status: "EXPIRED" })
    .where(and(eq(targetAuthorizations.id, id), eq(targetAuthorizations.status, row.status)))
    .returning();
  return expired ?? findAuthorization(db, id);
}
