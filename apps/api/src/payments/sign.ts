import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import type { DownstreamPayerDeps } from "./downstream";
import type { SelectedAccept } from "./accept-match";
import { expectedTxIdOf, type ExpectedTxId } from "./expected-txid";
import { ReplayHeader } from "./paid-response";
import { withPaymentIdentity } from "./payment-identity";

export function httpClientCappedAt(
  deps: DownstreamPayerDeps,
  accept: PaymentRequirements,
): x402HTTPClient {
  const client = new x402Client().register(deps.network, deps.scheme).setSpendControls({
    maxAmountPerPayment: false,
    allowedAssets: [
      { network: accept.network, asset: accept.asset, maxAmountPerPayment: accept.amount },
    ],
  });
  return new x402HTTPClient(client);
}

export interface Signed {
  readonly replayHeader: ReplayHeader;
  readonly expected: ExpectedTxId;
}

export async function sign(
  http: x402HTTPClient,
  selected: SelectedAccept,
  body: string | null,
  operationId: string,
): Promise<Signed> {
  const payload = await http.createPaymentPayload(
    withPaymentIdentity(selected.paymentRequired, operationId),
  );
  const [entry, ...extra] = Object.entries(http.encodePaymentSignatureHeader(payload));
  if (entry === undefined || extra.length > 0) {
    throw new Error("x402 client produced an unexpected signature header set");
  }
  return {
    replayHeader: new ReplayHeader(entry[0], entry[1], body),
    expected: expectedTxIdOf(payload),
  };
}
