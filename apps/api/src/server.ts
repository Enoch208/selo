import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createApp } from "./app";
import { liveVerificationFetch } from "./authorizations/deps";
import { createCatalogClient } from "./catalog/client";
import { createDb } from "./db/client";
import { loadEnv, loadOperatorEnv, payToWarning } from "./env";
import { publicUrl } from "./http/public-url";
import { createSafeFetch } from "./net/safe-fetch";
import { scheduleResweep, sweepStrandedJobs } from "./orchestrator/boot-sweep";
import { createJobRunner } from "./orchestrator/run-job";
import { createInboundGate } from "./payments/inbound";
import { seloNetworks } from "./payments/networks";
import { createAvmPaymentScheme } from "./payments/wallet";
import { createAlgodWalletBalance } from "./payments/wallet-balance";
import { liveProbeFetch } from "./preflight/deps";
import { ensureReportsDir } from "./reports/packet";

const env = loadEnv(process.env);
const operator = loadOperatorEnv(process.env);
const network = seloNetworks[env.SELO_NETWORK];
const db = createDb(env.DATABASE_URL);
await ensureReportsDir(operator.REPORTS_DIR);

const gate = await createInboundGate({
  facilitator: new HTTPFacilitatorClient({ url: env.FACILITATOR_URL }),
  facilitatorUrl: env.FACILITATOR_URL,
  network: network.caip2,
  usdcAssetId: network.usdcAssetId,
  payTo: env.SELO_PAY_TO,
  priceMicros: env.SELO_TEST_PRICE_MICROS,
  resourceUrl: publicUrl(env.PUBLIC_BASE_URL, "/v1/release-test"),
});

const reports = {
  dir: operator.REPORTS_DIR,
  tokenSecret: operator.REPORT_TOKEN_SECRET,
  publicBaseUrl: env.PUBLIC_BASE_URL,
};

const runner = createJobRunner({
  db,
  network,
  scheme: createAvmPaymentScheme(operator.SELO_OPERATOR_MNEMONIC, network.algodUrl),
  targetFetch: createSafeFetch,
  catalog: createCatalogClient({ baseUrl: env.FACILITATOR_URL, ttlMs: 0 }),
  walletBalance: createAlgodWalletBalance(network.algodUrl, operator.operatingAddress),
  absoluteCapMicros: env.SELO_ABSOLUTE_MAX_SPEND_MICROS,
  wallClockMs: operator.JOB_WALL_CLOCK_MS,
  reports,
});

const sweepDeps = { db, reports, wallClockMs: operator.JOB_WALL_CLOCK_MS };
await sweepStrandedJobs(sweepDeps, new Date());
void scheduleResweep(sweepDeps);

const app = createApp(db, {
  identity: { publicBaseUrl: env.PUBLIC_BASE_URL },
  authorizations: {
    ttlHours: env.AUTHORIZATION_TTL_HOURS,
    verificationFetch: liveVerificationFetch,
  },
  preflight: {
    probeFetch: liveProbeFetch,
    catalog: createCatalogClient({ baseUrl: env.FACILITATOR_URL }),
    network,
    jobMaxSpendMicros: env.SELO_JOB_MAX_SPEND_MICROS,
    seloPriceMicros: env.SELO_TEST_PRICE_MICROS,
    ttlMinutes: env.PREFLIGHT_TTL_MINUTES,
  },
  release: {
    gate,
    runner,
    jobMaxSpendMicros: env.SELO_JOB_MAX_SPEND_MICROS,
    gitSha: env.GIT_SHA ?? null,
  },
});

const payToNotice = payToWarning(env.SELO_PAY_TO, operator.operatingAddress);
if (payToNotice !== null) {
  process.stdout.write(`WARNING ${payToNotice}\n`);
}

serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  process.stdout.write(
    `Selo API listening on http://${env.HOST}:${String(info.port)} (operator ${operator.operatingAddress} on ${env.SELO_NETWORK})\n`,
  );
});
