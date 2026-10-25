import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpMethod } from "@selo/core";
import { createMerchantApp, ordersPath } from "@selo/example-merchant";
import { merchantNetworks } from "@selo/example-merchant/networks";
import type { Release } from "@selo/example-merchant/orders";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import algosdk from "algosdk";
import type { CatalogClient, CatalogLookup } from "../../src/catalog/client";
import type { SafeFetch, SafeFetchOptions } from "../../src/net/safe-fetch";
import type { FetchLike } from "../../src/payments/transport";
import { TargetFacilitator } from "../orchestrator/target-facilitator";

export const demoOrigin = "https://shop.example.com";
export const demoUrl = `${demoOrigin}${ordersPath}`;
export const demoPayTo = algosdk.generateAccount().addr.toString();

type MerchantApp = ReturnType<typeof createMerchantApp>;

const bazaarInfoOf = (bazaar: unknown): unknown =>
  typeof bazaar === "object" && bazaar !== null && "info" in bazaar ? bazaar.info : undefined;

export class DemoDeployment implements CatalogClient {
  readonly facilitator = new TargetFacilitator();
  readonly paidRequests: string[] = [];
  private readonly verificationFile = join(
    mkdtempSync(join(tmpdir(), "selo-demo-merchant-")),
    "selo-verification.txt",
  );
  private live: MerchantApp;
  private liveRelease: Release;

  constructor(release: Release) {
    this.liveRelease = release;
    this.live = this.build(release);
  }

  get release(): Release {
    return this.liveRelease;
  }

  ship(release: Release): void {
    this.liveRelease = release;
    this.live = this.build(release);
  }

  serveVerification(expectedContent: string): void {
    writeFileSync(this.verificationFile, `${expectedContent}\n`);
  }

  health(): Promise<Response> {
    return Promise.resolve(this.live.request(`${demoOrigin}/health`));
  }

  readonly fetchFor = (options: SafeFetchOptions): FetchLike => {
    return (input, init) => {
      if (new URL(input).origin !== options.allowedOrigin) {
        return Promise.reject(new Error(`${input} is outside ${options.allowedOrigin}`));
      }
      if (new Headers(init.headers).has("PAYMENT-SIGNATURE")) {
        this.paidRequests.push(input);
      }
      return Promise.resolve(this.live.request(input, init));
    };
  };

  readonly verificationFetch = (origin: string): SafeFetch => {
    return (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return this.fetchFor({ allowedOrigin: origin, timeoutMs: 10_000 })(url, init ?? {});
    };
  };

  async find(resourceUrl: string, method: HttpMethod): Promise<CatalogLookup> {
    if (this.facilitator.settled.length === 0 || resourceUrl !== demoUrl || method !== "POST") {
      return { kind: "not_found" };
    }
    const unpaid = await this.live.request(demoUrl, { method: "POST" });
    const challenge = decodePaymentRequiredHeader(unpaid.headers.get("PAYMENT-REQUIRED") ?? "");
    return {
      kind: "found",
      record: {
        id: "res_demo_orders",
        resourceUrl: challenge.resource.url,
        method: "POST",
        description: challenge.resource.description,
        mimeType: challenge.resource.mimeType,
        accepts: challenge.accepts,
        discoveryInfo: bazaarInfoOf(challenge.extensions?.bazaar),
      },
    };
  }

  private build(release: Release): MerchantApp {
    return createMerchantApp({
      release,
      network: merchantNetworks["algorand-testnet"],
      payTo: demoPayTo,
      publicOrigin: demoOrigin,
      facilitator: this.facilitator,
      verificationFile: this.verificationFile,
    });
  }
}
