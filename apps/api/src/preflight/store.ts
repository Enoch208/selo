import type { AlgorandRequirement, HttpMethod, JsonValue, PreflightRejection } from "@selo/core";
import { eq } from "drizzle-orm";
import type { Db, PreflightRow } from "../db/client";
import { preflights } from "../db/schema";
import { notFound } from "../http/errors";
import type { RecordedJson } from "./assess";

export interface PreflightRecord {
  readonly id: string;
  readonly authorizationId: string;
  readonly targetUrl: string;
  readonly method: HttpMethod;
  readonly requestBody: JsonValue | undefined;
  readonly reason: PreflightRejection | null;
  readonly requirement: AlgorandRequirement | null;
  readonly challenge: RecordedJson | null;
  readonly discovery: RecordedJson | null;
  readonly expiresAt: Date;
}

export async function insertPreflight(db: Db, record: PreflightRecord): Promise<PreflightRow> {
  const { requirement, challenge, discovery } = record;
  const [row] = await db
    .insert(preflights)
    .values({
      id: record.id,
      authorizationId: record.authorizationId,
      targetUrl: record.targetUrl,
      httpMethod: record.method,
      paymentNetwork: requirement?.network ?? null,
      paymentAsset: requirement?.asset ?? null,
      paymentAmountMicros: requirement?.amountMicros ?? null,
      payTo: requirement?.payTo ?? null,
      paymentRequirementsHash: challenge?.hash ?? null,
      paymentRequirementsJson: challenge?.json ?? null,
      requestBodyJson: record.requestBody ?? null,
      discoveryHash: discovery?.hash ?? null,
      discoveryJson: discovery?.json ?? null,
      eligible: record.reason === null,
      rejectionReason: record.reason,
      expiresAt: record.expiresAt,
    })
    .returning();
  if (row === undefined) {
    throw new Error("Inserting the preflight returned no row");
  }
  return row;
}

export async function findPreflight(db: Db, id: string): Promise<PreflightRow> {
  const [row] = await db.select().from(preflights).where(eq(preflights.id, id));
  if (row === undefined) {
    throw notFound("Preflight", id);
  }
  return row;
}
