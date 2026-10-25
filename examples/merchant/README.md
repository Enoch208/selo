# Demo merchant

An owned x402 merchant that shows what ordinary HTTP checks miss. It sells one demo order for
0.01 USDC on Algorand behind the stock `@x402/hono` payment middleware, and it ships two releases
at the same URL:

| Release     | `GET /health` | Unpaid `POST /v1/orders`   | Paid `POST /v1/orders`                            |
| ----------- | ------------- | -------------------------- | ------------------------------------------------- |
| `broken-v1` | 200           | 402 with a valid challenge | 200 and settles, but the receipt has `receipt_id` |
| `fixed-v2`  | 200           | 402 with a valid challenge | 200 and settles, with the declared `receiptId`    |

`broken-v1` models a serializer change that renamed one field. The endpoint is healthy, the
payment settles and the status is 200, yet every client that reads `receiptId` breaks. Only a
paid request against the release contract in [`contract.json`](contract.json) catches it. Selo
reports that as a `response_contract` FAIL with `SCHEMA_MISMATCH`, while the other four checks
pass.

Both releases declare the same 402, Bazaar metadata and receipt schema. The receipt id is derived
from the signed payment, so one payment always yields the same receipt. Selo's replay check
re-sends the identical payment, and the facilitator refuses to settle it twice.

## Run it

```bash
MERCHANT_RELEASE=broken-v1 \
MERCHANT_NETWORK=algorand-testnet \
MERCHANT_PAY_TO=<your Algorand address, opted in to USDC> \
MERCHANT_PUBLIC_ORIGIN=http://localhost:8792 \
PORT=8792 \
pnpm --filter @selo/example-merchant start

curl -s localhost:8792/health
curl -s -i -X POST localhost:8792/v1/orders -H 'content-type: application/json' -d @order.json
```

| Variable                 | Meaning                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `MERCHANT_RELEASE`       | `broken-v1` or `fixed-v2`                                                              |
| `MERCHANT_NETWORK`       | `algorand-testnet` or `algorand-mainnet`                                               |
| `MERCHANT_PAY_TO`        | The payee address; it must be opted in to USDC                                         |
| `MERCHANT_PUBLIC_ORIGIN` | The public https origin clients use (http only for localhost)                          |
| `SELO_VERIFICATION_FILE` | Optional path to a `selo-verification.txt` served at `/.well-known/`, read per request |
| `FACILITATOR_URL`        | Defaults to `https://facilitator.goplausible.xyz`                                      |
| `PORT`, `HOST`           | Default `8791` and `127.0.0.1`                                                         |

Selo only tests public HTTPS endpoints, so a real release test needs the merchant behind a public
origin, for example behind nginx with a Let's Encrypt certificate. To ship the fix, set
`MERCHANT_RELEASE=fixed-v2` and restart.

## Files

- [`src/app.ts`](src/app.ts): the routes, the 402 configuration and the Bazaar declaration.
- [`src/orders.ts`](src/orders.ts): both releases, the order schema and the receipt schema.
- [`contract.json`](contract.json): the release contract; a test keeps it equal to the advertised receipt schema.
- [`order.json`](order.json): the request body Selo sends.
