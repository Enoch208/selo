import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { createDb } from "../src/db/client";
import type { SafeFetch } from "../src/net/safe-fetch";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || !/\/selo_test(_[a-z0-9]+)?$/.test(databaseUrl)) {
  throw new Error("API tests must run against the selo_test database");
}

export const db = createDb(databaseUrl);
export const authorizationTtlHours = 24;

type Answer =
  | { readonly kind: "respond"; readonly response: () => Response }
  | {
      readonly kind: "fail";
      readonly error: Error;
    };

export class FakeVerifier {
  readonly requests: { readonly origin: string; readonly url: string }[] = [];
  private answer: Answer = { kind: "respond", response: () => new Response("", { status: 404 }) };
  private beforeAnswer: () => Promise<void> = () => Promise.resolve();

  whileFetching(effect: () => Promise<void>): void {
    this.beforeAnswer = effect;
  }

  respond(body: string, status = 200): void {
    this.answer = { kind: "respond", response: () => new Response(body, { status }) };
  }

  fail(error: Error): void {
    this.answer = { kind: "fail", error };
  }

  reset(): void {
    this.requests.length = 0;
    this.answer = { kind: "respond", response: () => new Response("", { status: 404 }) };
    this.beforeAnswer = () => Promise.resolve();
  }

  fetchFor = (origin: string): SafeFetch => {
    return async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      this.requests.push({ origin, url });
      await this.beforeAnswer();
      if (this.answer.kind === "fail") {
        throw this.answer.error;
      }
      return this.answer.response();
    };
  };
}

export const verifier = new FakeVerifier();

export const app = createApp(db, {
  authorizations: { ttlHours: authorizationTtlHours, verificationFetch: verifier.fetchFor },
});

export function resetDatabaseBetweenTests(): void {
  beforeEach(async () => {
    await db.execute(
      sql`truncate evidence, downstream_payments, scenarios, release_jobs, preflights, target_authorizations cascade`,
    );
    verifier.reset();
  });
  afterAll(async () => {
    await db.$client.end();
  });
}

export interface Reply<Body> {
  readonly status: number;
  readonly body: Body;
  readonly text: string;
}

export async function call<Body>(
  method: string,
  path: string,
  payload?: unknown,
): Promise<Reply<Body>> {
  const response = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  const body: unknown = JSON.parse(text);
  return { status: response.status, body: body as Body, text };
}
