import type { AuthorizationView } from "@selo/core";
import { z } from "zod";
import type { Db } from "../db/client";
import { targetAuthorizations } from "../db/schema";
import { grantConsentSchema } from "../http/schemas";
import { newId } from "../ids";
import { parseTarget } from "../net/target";
import { expiryAfter, toView } from "./view";

export type ConsentOutcome =
  | { readonly ok: true; readonly authorization: AuthorizationView }
  | { readonly ok: false; readonly message: string };

export async function grantConsent(
  db: Db,
  raw: unknown,
  ttlHours: number,
): Promise<ConsentOutcome> {
  const parsed = grantConsentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: z.prettifyError(parsed.error) };
  }
  const input = parsed.data;
  const target = parseTarget(input.targetUrl);
  if (!target.ok) {
    return { ok: false, message: `The target URL is rejected: ${target.reason}` };
  }
  const verifiedAt = new Date();
  const [row] = await db
    .insert(targetAuthorizations)
    .values({
      id: newId("auth"),
      origin: target.target.origin,
      routePath: target.target.path,
      httpMethod: input.method,
      authorizationType: "manual_owner_consent",
      consentNote: input.note,
      project: input.project,
      contact: input.contact,
      status: "VERIFIED",
      verifiedAt,
      expiresAt: expiryAfter(verifiedAt, ttlHours),
    })
    .returning();
  if (row === undefined) {
    throw new Error("Inserting the consent returned no row");
  }
  return { ok: true, authorization: toView(row) };
}
