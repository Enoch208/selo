import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  ApiError,
  AuthorizationChallengeView,
  AuthorizationView,
  CreateAuthorizationBody,
} from "@selo/core";
import { describe, expect, it } from "vitest";
import { grantConsent } from "../src/authorizations/consent";
import { targetAuthorizations } from "../src/db/schema";
import { SafeFetchError } from "../src/net/safe-fetch";
import { authorizationTtlHours, call, db, resetDatabaseBetweenTests, verifier } from "./support";

resetDatabaseBetweenTests();

const hourMs = 3_600_000;

function body(overrides: Partial<CreateAuthorizationBody> = {}): CreateAuthorizationBody {
  return {
    targetUrl: "https://api.example.com/v1/quote?symbol=ALGO",
    method: "GET",
    project: "Quote API",
    contact: "owner@example.com",
    ...overrides,
  };
}

async function createChallenge(
  overrides: Partial<CreateAuthorizationBody> = {},
): Promise<AuthorizationChallengeView> {
  const reply = await call<AuthorizationChallengeView>(
    "POST",
    "/v1/authorizations",
    body(overrides),
  );
  if (reply.status !== 201) {
    throw new Error(`Creating an authorization failed with ${String(reply.status)}`);
  }
  return reply.body;
}

async function rowOf(id: string) {
  const [row] = await db.select().from(targetAuthorizations).where(eq(targetAuthorizations.id, id));
  if (row === undefined) {
    throw new Error(`Authorization ${id} is missing`);
  }
  return row;
}

const verify = (id: string) =>
  call<AuthorizationView & ApiError>("POST", `/v1/authorizations/${id}/verify`);
const read = (id: string) => call<AuthorizationView & ApiError>("GET", `/v1/authorizations/${id}`);

async function verified(): Promise<AuthorizationChallengeView> {
  const challenge = await createChallenge();
  verifier.respond(`${challenge.expectedContent}\n`);
  const reply = await verify(challenge.authorizationId);
  expect(reply.status).toBe(200);
  return challenge;
}

describe("creating an authorization challenge", () => {
  it("returns 201 with the well-known challenge and stores only the nonce hash", async () => {
    const reply = await call<AuthorizationChallengeView>("POST", "/v1/authorizations", body());
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({
      status: "PENDING",
      origin: "https://api.example.com",
      routePath: "/v1/quote",
      method: "GET",
      verificationUrl: "https://api.example.com/.well-known/selo-verification.txt",
    });
    expect(reply.body.authorizationId).toMatch(/^auth_[0-9A-HJKMNP-TV-Z]{26}$/);
    const nonce = reply.body.expectedContent.replace(/^selo-verification=/, "");
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await rowOf(reply.body.authorizationId);
    expect(row.authorizationType).toBe("well_known_file");
    expect(row.verificationNonceHash).toBe(createHash("sha256").update(nonce).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(nonce);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(hourMs - 60_000);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(hourMs);
  });

  it.each([
    ["http://api.example.com/v1/quote", "TARGET_NOT_HTTPS"],
    ["https://127.0.0.1/v1/quote", "TARGET_ADDRESS_BLOCKED"],
    ["https://localhost/v1/quote", "TARGET_ADDRESS_BLOCKED"],
    ["not a url", "TARGET_URL_INVALID"],
  ])("rejects the blocked target %s with 400 %s", async (targetUrl, code) => {
    const reply = await call<ApiError>("POST", "/v1/authorizations", body({ targetUrl }));
    expect(reply.status).toBe(400);
    expect(reply.body.error).toBe(code);
    expect(await db.select().from(targetAuthorizations)).toEqual([]);
  });

  it.each([
    [{ method: "DELETE" }],
    [{ project: "" }],
    [{ project: "x".repeat(81) }],
    [{ contact: "ab" }],
    [{ contact: "x".repeat(201) }],
  ])("rejects an invalid body %o with 400", async (overrides) => {
    const reply = await call<ApiError>("POST", "/v1/authorizations", { ...body(), ...overrides });
    expect(reply.status).toBe(400);
    expect(reply.body.error).toBe("VALIDATION_FAILED");
  });
});

describe("verifying the well-known file", () => {
  it("verifies when the file carries the expected line and sets the TTL", async () => {
    const challenge = await createChallenge();
    verifier.respond(`# selo\n  ${challenge.expectedContent}  \nother=1\n`);
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      authorizationId: challenge.authorizationId,
      status: "VERIFIED",
      type: "well_known_file",
      origin: "https://api.example.com",
      routePath: "/v1/quote",
      method: "GET",
    });
    expect(verifier.requests).toEqual([
      { origin: "https://api.example.com", url: challenge.verificationUrl },
    ]);
    const row = await rowOf(challenge.authorizationId);
    expect(row.verifiedAt).not.toBeNull();
    const ttl = row.expiresAt.getTime() - (row.verifiedAt?.getTime() ?? 0);
    expect(ttl).toBe(authorizationTtlHours * hourMs);
  });

  it("is idempotent for an already verified, unexpired authorization", async () => {
    const challenge = await verified();
    verifier.fail(new Error("must not be fetched again"));
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(200);
    expect(reply.body.status).toBe("VERIFIED");
  });

  it("A09 (auth): an unverified target has no valid authorization", async () => {
    const challenge = await createChallenge();
    verifier.respond("selo-verification=someone-elses-nonce\n");
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toBe("VERIFICATION_FAILED");
    const row = await rowOf(challenge.authorizationId);
    expect(row.status).toBe("PENDING");
    expect(row.verifiedAt).toBeNull();
    expect((await read(challenge.authorizationId)).body.status).toBe("PENDING");
  });

  it("fails verification when the file is missing", async () => {
    const challenge = await createChallenge();
    verifier.respond(challenge.expectedContent, 404);
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toBe("VERIFICATION_FAILED");
  });

  it("fails verification when the file is larger than 4 KiB", async () => {
    const challenge = await createChallenge();
    verifier.respond(`${challenge.expectedContent}\n${"x".repeat(4096)}`);
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toBe("VERIFICATION_FAILED");
  });

  it("expires a pending challenge past its hour and answers 409 CHALLENGE_EXPIRED", async () => {
    const challenge = await createChallenge();
    await db
      .update(targetAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(targetAuthorizations.id, challenge.authorizationId));
    verifier.respond(challenge.expectedContent);
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toBe("CHALLENGE_EXPIRED");
    expect((await rowOf(challenge.authorizationId)).status).toBe("EXPIRED");
    expect(verifier.requests).toEqual([]);
  });

  it("refuses a challenge whose hour runs out while the file is being fetched", async () => {
    const challenge = await createChallenge();
    verifier.respond(challenge.expectedContent);
    verifier.whileFetching(async () => {
      await db
        .update(targetAuthorizations)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(targetAuthorizations.id, challenge.authorizationId));
    });
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toBe("CHALLENGE_EXPIRED");
    const row = await rowOf(challenge.authorizationId);
    expect(row.status).toBe("EXPIRED");
    expect(row.verifiedAt).toBeNull();
  });

  it("answers 422 with the reason when the safe fetch blocks the target", async () => {
    const challenge = await createChallenge();
    verifier.fail(new SafeFetchError({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" }));
    const reply = await verify(challenge.authorizationId);
    expect(reply.status).toBe(422);
    expect(reply.body.error).toBe("TARGET_ADDRESS_BLOCKED");
    expect((await rowOf(challenge.authorizationId)).status).toBe("PENDING");
  });

  it.each([[{ kind: "timeout" as const }], [{ kind: "network" as const }]])(
    "answers 502 VERIFICATION_UNREACHABLE on %o",
    async (failure) => {
      const challenge = await createChallenge();
      verifier.fail(new SafeFetchError(failure));
      const reply = await verify(challenge.authorizationId);
      expect(reply.status).toBe(502);
      expect(reply.body.error).toBe("VERIFICATION_UNREACHABLE");
      expect((await rowOf(challenge.authorizationId)).status).toBe("PENDING");
    },
  );

  it.each(["auth_00000000000000000000000000", "not-an-id"])(
    "answers 404 for the unknown id %s",
    async (id) => {
      const reply = await verify(id);
      expect(reply.status).toBe(404);
      expect(reply.body.error).toBe("NOT_FOUND");
    },
  );
});

describe("reading an authorization", () => {
  it("never returns the nonce or its hash", async () => {
    const challenge = await createChallenge();
    const nonce = challenge.expectedContent.replace(/^selo-verification=/, "");
    const hash = (await rowOf(challenge.authorizationId)).verificationNonceHash ?? "";
    const pending = await read(challenge.authorizationId);
    verifier.respond(challenge.expectedContent);
    await verify(challenge.authorizationId);
    const done = await read(challenge.authorizationId);
    for (const reply of [pending, done]) {
      expect(reply.status).toBe(200);
      expect(reply.text).not.toContain(nonce);
      expect(reply.text).not.toContain(hash);
      expect(Object.keys(reply.body).sort()).toEqual([
        "authorizationId",
        "expiresAt",
        "method",
        "origin",
        "routePath",
        "status",
        "type",
        "verifiedAt",
      ]);
    }
    expect(done.body.status).toBe("VERIFIED");
  });

  it("reports and persists a verified authorization past its TTL as EXPIRED", async () => {
    const challenge = await verified();
    await db
      .update(targetAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(targetAuthorizations.id, challenge.authorizationId));
    const reply = await read(challenge.authorizationId);
    expect(reply.status).toBe(200);
    expect(reply.body.status).toBe("EXPIRED");
    expect((await rowOf(challenge.authorizationId)).status).toBe("EXPIRED");
  });

  it("answers 404 for an unknown id", async () => {
    const reply = await read("auth_00000000000000000000000000");
    expect(reply.status).toBe(404);
  });
});

describe("manual owner consent", () => {
  const consent = {
    targetUrl: "https://api.example.com/v1/quote",
    method: "POST",
    project: "Quote API",
    contact: "owner@example.com",
    note: "Owner approved Selo testing by email on 2026-09-27",
  };

  it("records an explicit VERIFIED manual_owner_consent row with the note", async () => {
    const outcome = await grantConsent(db, consent, authorizationTtlHours);
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    const row = await rowOf(outcome.authorization.authorizationId);
    expect(row).toMatchObject({
      authorizationType: "manual_owner_consent",
      status: "VERIFIED",
      consentNote: consent.note,
      verificationNonceHash: null,
      origin: "https://api.example.com",
      routePath: "/v1/quote",
      httpMethod: "POST",
    });
    const ttl = row.expiresAt.getTime() - (row.verifiedAt?.getTime() ?? 0);
    expect(ttl).toBe(authorizationTtlHours * hourMs);
  });

  it.each([
    [{ note: "" }],
    [{ note: "   " }],
    [{ targetUrl: "https://127.0.0.1/v1/quote" }],
    [{ targetUrl: "http://api.example.com/v1/quote" }],
  ])("refuses consent without a note or for a blocked target (%o)", async (overrides) => {
    const outcome = await grantConsent(db, { ...consent, ...overrides }, authorizationTtlHours);
    expect(outcome.ok).toBe(false);
    expect(await db.select().from(targetAuthorizations)).toEqual([]);
  });
});
