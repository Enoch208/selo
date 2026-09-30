import { describe, expect, it } from "vitest";
import { identityRoutes } from "../../src/identity/routes";

const app = identityRoutes({ publicBaseUrl: "https://api.useselo.xyz" });

describe("merchant identity metadata", () => {
  it("serves a homepage whose OpenGraph tags name Selo", async () => {
    const response = await app.request("/");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(html).toContain('<meta property="og:title" content="Selo">');
    expect(html).toContain('<meta property="og:site_name" content="Selo">');
    expect(html).toContain('<meta property="og:url" content="https://api.useselo.xyz/">');
    expect(html).toContain("<title>Selo");
    expect(html).toContain('<meta property="og:image" content="https://useselo.xyz/og.png">');
  });

  it("serves llms.txt that names Selo and its paid route", async () => {
    const response = await app.request("/llms.txt");
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(text.startsWith("# Selo\n")).toBe(true);
    expect(text).toContain("https://api.useselo.xyz/v1/release-test");
  });

  it("serves an agent card that names Selo and its release-test skill", async () => {
    const response = await app.request("/.well-known/agent-card.json");
    const card: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(card).toMatchObject({
      name: "Selo",
      url: "https://api.useselo.xyz",
      iconUrl: "https://useselo.xyz/brand/selo-logo-512.png",
      provider: { organization: "Selo" },
      skills: [{ id: "x402-release-test" }],
    });
  });

  it("joins a base path without dropping it", async () => {
    const nested = identityRoutes({ publicBaseUrl: "https://example.com/selo" });
    const text = await (await nested.request("/llms.txt")).text();
    expect(text).toContain("https://example.com/selo/v1/release-test");
  });
});
