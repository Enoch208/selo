import type { AuthorizationChallengeView } from "@selo/core";
import type { z } from "zod";
import type { Db } from "../db/client";
import { targetAuthorizations } from "../db/schema";
import type { createAuthorizationSchema } from "../http/schemas";
import { newId } from "../ids";
import { newChallenge, pendingChallengeMs, verificationUrl } from "./challenge";
import { authorizableTarget } from "./target";

export async function createAuthorization(
  db: Db,
  input: z.output<typeof createAuthorizationSchema>,
): Promise<AuthorizationChallengeView> {
  const target = authorizableTarget(input.targetUrl);
  const challenge = newChallenge();
  const [row] = await db
    .insert(targetAuthorizations)
    .values({
      id: newId("auth"),
      origin: target.origin,
      routePath: target.path,
      httpMethod: input.method,
      authorizationType: "well_known_file",
      verificationNonceHash: challenge.nonceHash,
      project: input.project,
      contact: input.contact,
      expiresAt: new Date(Date.now() + pendingChallengeMs),
    })
    .returning();
  if (row === undefined) {
    throw new Error("Inserting the authorization returned no row");
  }
  return {
    authorizationId: row.id,
    status: row.status,
    origin: row.origin,
    routePath: row.routePath,
    method: row.httpMethod,
    verificationUrl: verificationUrl(row.origin),
    expectedContent: challenge.expectedContent,
  };
}
