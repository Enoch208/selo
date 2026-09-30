export const ownCapture402 = {
  x402Version: 2,
  error: "Payment required",
  resource: {
    url: "https://selo.example/v1/release-test",
    description: "d",
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
      amount: "1000000",
      asset: "31566704",
      payTo: "XMBY7EABEU6YPDJRCBISZDFM4MPYLHH5V6TVWYDU5LIIT2NC3SGHKANNQI",
      maxTimeoutSeconds: 300,
      extra: {
        name: "USDC",
        decimals: 6,
        tag: "x402-global-challenge",
        feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
      },
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "http",
          bodyType: "json",
          body: {
            preflightId: "pfl_x",
          },
          method: "POST",
        },
        output: {
          type: "json",
          example: {
            verdict: "PASS",
          },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", enum: ["POST"] },
              bodyType: { type: "string", enum: ["json", "form-data", "text"] },
              body: {
                properties: { preflightId: { type: "string" } },
                required: ["preflightId"],
              },
            },
            required: ["type", "method", "bodyType", "body"],
            additionalProperties: false,
          },
          output: {
            type: "object",
            properties: { type: { type: "string" }, example: { type: "object" } },
            required: ["type"],
          },
        },
        required: ["input"],
      },
    },
  },
};

export const liveAgentkeepCapture402 = {
  x402Version: 2,
  error: "Payment required",
  resource: {
    url: "https://api.agentkeep.online/v1/memory",
    description: "List wallet-scoped memory keys (no values).",
    mimeType: "application/json",
    serviceName: "AgentKeep",
    tags: ["x402-global-challenge"],
  },
  accepts: [
    {
      scheme: "exact",
      network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
      amount: "1000",
      asset: "31566704",
      payTo: "2VIU2N25S2TRAJ54ZTUY5CSFADU6Y5KEMKAWTRWR2ODNTPULNGHBKWEPTQ",
      maxTimeoutSeconds: 300,
      extra: {
        tag: "x402-global-challenge",
        asa_id: 31566704,
        adapter: "live",
        description: "List wallet-scoped memory keys (no values).",
        resource: "GET /v1/memory",
        resource_url: "https://api.agentkeep.online/v1/memory",
        feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
      },
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: { type: "http", method: "GET", queryParams: {} },
        output: {
          type: "json",
          example: { keys: [{ key: "plan", updated_at: "2026-09-24T00:00:00.000Z" }] },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", enum: ["GET", "HEAD", "DELETE"] },
              queryParams: { type: "object", properties: {} },
            },
            required: ["type", "method"],
            additionalProperties: false,
          },
          output: {
            type: "object",
            properties: { type: { type: "string" }, example: { type: "object" } },
            required: ["type"],
          },
        },
        required: ["input"],
      },
    },
    "x402-merchant": {
      info: {
        name: "AgentKeep",
        website: "https://agentkeep.online",
        categories: ["api", "algorand", "x402", "agent-os", "memory", "fetch", "budget", "notify"],
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
