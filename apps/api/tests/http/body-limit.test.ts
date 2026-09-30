import type { ApiError } from "@selo/core";
import { describe, expect, it } from "vitest";
import { app, resetDatabaseBetweenTests } from "../support";

resetDatabaseBetweenTests();

const limitBytes = 64 * 1024;

async function postAuthorization(body: string): Promise<Response> {
  return await app.request("/v1/authorizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function paddedBody(totalBytes: number): string {
  const base = { targetUrl: "https://api.example.com/x", method: "GET", project: "p", contact: "" };
  const skeleton = JSON.stringify(base);
  return JSON.stringify({ ...base, contact: "a".repeat(totalBytes - skeleton.length) });
}

describe("JSON request body limit", () => {
  it("answers a body over 64 KiB with a JSON 413 before any handler reads it", async () => {
    const body = paddedBody(limitBytes + 1);
    expect(Buffer.byteLength(body)).toBe(limitBytes + 1);
    const response = await postAuthorization(body);
    expect(response.status).toBe(413);
    const payload = (await response.json()) as ApiError;
    expect(payload.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("lets a body of exactly 64 KiB through to validation", async () => {
    const body = paddedBody(limitBytes);
    expect(Buffer.byteLength(body)).toBe(limitBytes);
    const response = await postAuthorization(body);
    expect(response.status).not.toBe(413);
  });
});
