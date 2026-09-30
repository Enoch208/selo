import { publicUrl } from "../http/public-url";
import { releaseTestDescription, seloLogoUrl } from "../release/discovery";

export const seloName = "Selo";
export const seloTagline = "CI for x402. It pays your endpoint before your users do.";

export interface IdentityConfig {
  readonly publicBaseUrl: string;
}

export function baseUrlOf(config: IdentityConfig): string {
  return publicUrl(config.publicBaseUrl, "").replace(/\/$/, "");
}

export function homepageHtml(config: IdentityConfig): string {
  const home = publicUrl(config.publicBaseUrl, "/");
  const paidRoute = publicUrl(config.publicBaseUrl, "/v1/release-test");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${seloName} — ${seloTagline}</title>`,
    `<meta name="description" content="${releaseTestDescription}">`,
    `<meta property="og:title" content="${seloName}">`,
    `<meta property="og:site_name" content="${seloName}">`,
    `<meta property="og:description" content="${seloTagline}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${home}">`,
    '<meta property="og:image" content="https://useselo.xyz/og.png">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<link rel="icon" type="image/png" href="${seloLogoUrl}">`,
    "</head>",
    "<body>",
    `<h1>${seloName}</h1>`,
    `<p>${seloTagline}</p>`,
    `<p>${releaseTestDescription}</p>`,
    `<p>Paid route: <code>POST ${paidRoute}</code> (x402, Algorand USDC).</p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function llmsText(config: IdentityConfig): string {
  const route = (path: string) => publicUrl(config.publicBaseUrl, path);
  return [
    `# ${seloName}`,
    "",
    `> ${seloTagline}`,
    "",
    releaseTestDescription,
    "",
    "## Endpoints",
    "",
    `- POST ${route("/v1/authorizations")}: request a verification challenge for a target route (free)`,
    `- POST ${route("/v1/preflight")}: check a target is testable and within budget (free)`,
    `- POST ${route("/v1/release-test")}: run the release test (paid with x402, 1.00 USDC on Algorand)`,
    `- GET ${route("/v1/reports/{token}")}: private report`,
    "",
  ].join("\n");
}

export function agentCard(config: IdentityConfig) {
  const base = baseUrlOf(config);
  return {
    name: seloName,
    description: `${seloTagline} ${releaseTestDescription}`,
    url: base,
    iconUrl: seloLogoUrl,
    version: "1.0.0",
    provider: { organization: seloName, url: base },
    capabilities: {},
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "x402-release-test",
        name: "x402 release test",
        description: releaseTestDescription,
        tags: ["x402", "algorand", "testing", "developer-tools"],
      },
    ],
  };
}
