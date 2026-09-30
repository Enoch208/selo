import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  FacilitatorResponseError,
  x402HTTPResourceServer,
  x402ResourceServer,
  type FacilitatorClient,
  type RouteConfig,
} from "@x402/core/server";
import { SettleError, type Network } from "@x402/core/types";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  challengeTag,
  releaseTestDescription,
  releaseTestInputExample,
  releaseTestInputSchema,
  releaseTestOutputExample,
  releaseTestRoute,
  seloLogoUrl,
  seloMerchantExtension,
} from "../release/discovery";

export interface InboundGateConfig {
  readonly facilitator: FacilitatorClient;
  readonly facilitatorUrl: string;
  readonly network: Network;
  readonly usdcAssetId: string;
  readonly payTo: string;
  readonly priceMicros: number;
  readonly resourceUrl: string;
}

export type InboundGate = x402HTTPResourceServer;

export const settlementPendingReason = "settlement_pending";

export class InboundSettlementUnresolved extends FacilitatorResponseError {
  readonly transaction: string | null;

  constructor(cause: unknown, transaction: string | null) {
    super(
      `Inbound settlement outcome unknown: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "InboundSettlementUnresolved";
    this.transaction = transaction;
  }
}

function isRetryablePending(error: SettleError): boolean {
  return error.errorReason === settlementPendingReason && error.transaction !== "";
}

function definiteOrUnresolved(error: unknown): unknown {
  if (error instanceof SettleError) {
    return isRetryablePending(error) || error.statusCode < 500
      ? error
      : new InboundSettlementUnresolved(error, error.transaction === "" ? null : error.transaction);
  }
  return error instanceof FacilitatorResponseError
    ? error
    : new InboundSettlementUnresolved(error, null);
}

function settleDefinitelyOrUnresolved(facilitator: FacilitatorClient): FacilitatorClient {
  return {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    getSupported: () => facilitator.getSupported(),
    settle: async (payload, requirements) => {
      try {
        return await facilitator.settle(payload, requirements);
      } catch (error: unknown) {
        throw definiteOrUnresolved(error);
      }
    },
  };
}

function releaseTestRouteConfig(config: InboundGateConfig): RouteConfig {
  return {
    accepts: [
      {
        scheme: "exact",
        network: config.network,
        price: {
          asset: config.usdcAssetId,
          amount: String(config.priceMicros),
          extra: { name: "USDC", decimals: 6 },
        },
        payTo: config.payTo,
        maxTimeoutSeconds: 300,
        extra: { tag: challengeTag },
      },
    ],
    resource: config.resourceUrl,
    description: releaseTestDescription,
    mimeType: "application/json",
    serviceName: "Selo",
    iconUrl: seloLogoUrl,
    tags: [challengeTag],
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: releaseTestInputExample,
        inputSchema: releaseTestInputSchema,
        output: { example: releaseTestOutputExample },
      }),
      ...seloMerchantExtension,
    },
  };
}

export async function createInboundGate(config: InboundGateConfig): Promise<InboundGate> {
  const resourceServer = new x402ResourceServer(settleDefinitelyOrUnresolved(config.facilitator))
    .register(config.network, new ExactAvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  const gate = new x402HTTPResourceServer(resourceServer, {
    [releaseTestRoute]: releaseTestRouteConfig(config),
  });
  try {
    await gate.initialize();
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Selo cannot start: the facilitator at ${config.facilitatorUrl} did not confirm exact payments on ${config.network} (${reason})`,
      { cause: error },
    );
  }
  return gate;
}
