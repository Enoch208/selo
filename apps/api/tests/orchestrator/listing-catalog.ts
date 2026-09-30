import type { HttpMethod } from "@selo/core";
import type { CatalogClient, CatalogLookup } from "../../src/catalog/client";
import {
  quoteExample,
  targetNetwork,
  targetPayTo,
  targetUrl,
  type StockSeller,
} from "./stock-seller";

export type CatalogMode = "listed_after_settle" | "unavailable" | "throws";

export class ListingCatalog implements CatalogClient {
  readonly lookups: { readonly resourceUrl: string; readonly method: HttpMethod }[] = [];
  mode: CatalogMode = "listed_after_settle";

  private readonly seller: StockSeller;

  constructor(seller: StockSeller) {
    this.seller = seller;
  }

  reset(): void {
    this.lookups.length = 0;
    this.mode = "listed_after_settle";
  }

  record(): unknown {
    return {
      id: "res_quote",
      resourceUrl: targetUrl,
      method: "GET",
      description: "A paid price quote",
      mimeType: "application/json",
      accepts: [
        {
          scheme: "exact",
          network: targetNetwork.caip2,
          amount: String(this.seller.priceMicros),
          asset: targetNetwork.usdcAssetId,
          payTo: targetPayTo,
          maxTimeoutSeconds: 60,
        },
      ],
      discoveryInfo: { output: { example: quoteExample } },
    };
  }

  find(resourceUrl: string, method: HttpMethod): Promise<CatalogLookup> {
    this.lookups.push({ resourceUrl, method });
    if (this.mode === "throws") {
      return Promise.reject(new Error("catalog client broke its contract"));
    }
    if (this.mode === "unavailable") {
      return Promise.resolve({ kind: "unavailable", message: "discovery answered HTTP 503" });
    }
    const listed =
      this.seller.facilitator.settled.length > 0 && resourceUrl === targetUrl && method === "GET";
    return Promise.resolve(
      listed ? { kind: "found", record: this.record() } : { kind: "not_found" },
    );
  }
}
