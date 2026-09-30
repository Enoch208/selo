import type { ApiError } from "@selo/core";
import { describe, expect, it } from "vitest";
import { call, resetDatabaseBetweenTests } from "./support";

resetDatabaseBetweenTests();

describe("health", () => {
  it("reports ok after reaching the database", async () => {
    const reply = await call<{ status: string }>("GET", "/health");
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ status: "ok" });
  });

  it("answers unknown routes with a JSON 404", async () => {
    const reply = await call<ApiError>("GET", "/nope");
    expect(reply.status).toBe(404);
    expect(reply.body.error).toBe("NOT_FOUND");
  });
});
