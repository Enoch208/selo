import { describe, expect, it } from "vitest";
import { loadConsentEnv } from "../../src/env";

describe("consent:grant environment", () => {
  it("loads with only the database URL and defaults the authorization TTL", () => {
    expect(loadConsentEnv({ DATABASE_URL: "postgres://selo@localhost:54330/selo" })).toEqual({
      DATABASE_URL: "postgres://selo@localhost:54330/selo",
      AUTHORIZATION_TTL_HOURS: 24,
    });
  });

  it("does not require the server's payTo, public URL or operator secrets", () => {
    const env = loadConsentEnv({
      DATABASE_URL: "postgres://selo@localhost:54330/selo",
      AUTHORIZATION_TTL_HOURS: "6",
    });
    expect(env.AUTHORIZATION_TTL_HOURS).toBe(6);
  });

  it("still refuses a missing database URL or a bad TTL", () => {
    expect(() => loadConsentEnv({})).toThrow(/DATABASE_URL/);
    expect(() =>
      loadConsentEnv({
        DATABASE_URL: "postgres://selo@localhost/selo",
        AUTHORIZATION_TTL_HOURS: "0",
      }),
    ).toThrow(/AUTHORIZATION_TTL_HOURS/);
  });
});
