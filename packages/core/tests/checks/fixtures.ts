export const mainnetNetwork = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
export const mainnetUsdcAsset = "31566704";
export const merchantPayTo = "F76TVHATG2LJOMUOEFNSDJME2NRK77D2NXRM4IUE6MN7CMMGBZXUFJ3YWQ";

export const liveAcceptEntry = {
  scheme: "exact",
  network: mainnetNetwork,
  amount: "10000",
  asset: mainnetUsdcAsset,
  payTo: merchantPayTo,
  maxTimeoutSeconds: 300,
  extra: {
    name: "USDC",
    decimals: 6,
    feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
    tag: "x402-global-challenge",
  },
};

export const liveChallenge = {
  x402Version: 2,
  resource: {
    url: "https://civitas-api.civitasv.workers.dev/v1/public/stats",
    description:
      "Civitas network stats on Algorand: orgs whitelisted, consent requests, identities issued.",
    mimeType: "application/json",
  },
  accepts: [liveAcceptEntry],
  extensions: {
    bazaar: {
      info: {
        input: { type: "http", queryParams: {}, method: "GET" },
        output: {
          type: "json",
          example: { orgsWhitelisted: 1, consentRequests: 2, identitiesIssued: 0 },
        },
      },
      schema: { type: "object" },
    },
  },
};

export const catalogRecord = {
  id: "R0VUOmh0dHBzOi8vY2l2aXRhcy1hcGkuY2l2aXRhc3Yud29ya2Vycy5kZXYvdjEvcHVibGljL3N0YXRz",
  resourceUrl: "https://civitas-api.civitasv.workers.dev/v1/public/stats",
  method: "GET",
  description:
    "Civitas network stats on Algorand: orgs whitelisted, consent requests, identities issued.",
  mimeType: "",
  merchantId: "Rjc2VFZIQVRHMkxKT01VT0VGTlNESk1F",
  accepts: [liveAcceptEntry],
  discoveryInfo: {
    input: { type: "http", queryParams: {}, method: "GET" },
    output: {
      type: "json",
      example: { orgsWhitelisted: 1, consentRequests: 2, identitiesIssued: 0 },
    },
  },
  settleCount: 66,
  firstSeen: "2026-09-23T14:44:17.664Z",
  lastSeen: "2026-09-27T00:38:42.782Z",
};

export const validAlgorandAddresses: readonly string[] = [merchantPayTo];

export function isValidPayTo(address: string): boolean {
  return validAlgorandAddresses.includes(address);
}
