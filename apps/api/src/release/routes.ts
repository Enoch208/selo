import type { HTTPProcessResult, HTTPRequestContext } from "@x402/core/server";
import { FacilitatorResponseError } from "@x402/core/server";
import { HonoAdapter } from "@x402/hono";
import { Hono } from "hono";
import type { Db } from "../db/client";
import { HttpError } from "../http/errors";
import type { InboundGate } from "../payments/inbound";
import type { ReleaseDeps } from "./deps";
import { releaseIdempotencyKey } from "./idempotency";
import { claimJob } from "./jobs";
import { payablePreflight } from "./preflight-gate";
import { instructionsResponse, replyForExisting } from "./replies";
import { readReleaseRequest } from "./request";
import { settleThenRun } from "./settle-and-run";

async function verifyInbound(
  gate: InboundGate,
  request: HTTPRequestContext,
): Promise<HTTPProcessResult> {
  try {
    return await gate.processHTTPRequest(request);
  } catch (error: unknown) {
    if (error instanceof FacilitatorResponseError) {
      throw new HttpError(
        502,
        "FACILITATOR_UNAVAILABLE",
        "The payment facilitator could not verify the payment; nothing was charged",
      );
    }
    throw error;
  }
}

export function releaseRoutes(db: Db, deps: ReleaseDeps) {
  return new Hono().post("/v1/release-test", async (c) => {
    const { body, idempotencyKey } = await readReleaseRequest(c);
    await payablePreflight(db, body.preflightId, deps.jobMaxSpendMicros, new Date());
    const request: HTTPRequestContext = {
      adapter: new HonoAdapter(c),
      path: c.req.path,
      method: c.req.method,
    };
    const verified = await verifyInbound(deps.gate, request);
    if (verified.type === "payment-error") {
      return instructionsResponse(verified.response);
    }
    if (verified.type === "no-payment-required") {
      throw new Error("POST /v1/release-test is not protected by the inbound x402 gate");
    }
    const claim = await claimJob(db, {
      preflightId: body.preflightId,
      idempotencyKey: releaseIdempotencyKey(
        body.preflightId,
        idempotencyKey,
        verified.paymentPayload,
      ),
      maxSpendMicros: deps.jobMaxSpendMicros,
      expected: body.expected ?? null,
      gitSha: deps.gitSha,
    });
    if (claim.kind === "duplicate") {
      return replyForExisting(deps.runner, claim.job);
    }
    return settleThenRun(db, deps, claim.jobId, verified, request);
  });
}
