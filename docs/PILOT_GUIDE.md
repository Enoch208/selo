# Try Selo on your x402 endpoint

Selo pays your x402 endpoint the way a real customer would, before your users do. It checks that
the payment settles, that the paid response matches the contract you declare, that your Bazaar
listing agrees with your live 402, and that a replayed payment is not charged twice. It returns a
deterministic **PASS**, **FAIL** or **INCONCLUSIVE** verdict with both payment transactions and a
signed attestation.

## What is supported today

|                       |                                                                            |
| --------------------- | -------------------------------------------------------------------------- |
| Network and asset     | Algorand Mainnet, USDC (ASA 31566704)                                      |
| Methods               | `GET` and `POST` (JSON body)                                               |
| Your endpoint's price | Up to 0.50 USDC per paid request. Selo pays it from its own wallet         |
| Selo's price          | 1.00 USDC per release test, paid over x402                                 |
| Profile               | `quick`: one paid request plus one replay of the identical signed payment  |
| Authorization         | Valid for 24 hours after verification. A preflight is valid for 15 minutes |

## Before you start: what Selo will do to your endpoint

- **One unpaid request** to read your 402.
- **One paid request**, paying your price once from Selo's wallet.
- **One replay** of the identical signed payment and body, to check that a retry is not charged
  or fulfilled twice. If your paid route has side effects, use a staging or test SKU.

Selo only calls the exact HTTPS URL and method you authorize, refuses private and internal
addresses, and never follows a redirect with a signed payment.

## Steps

You need Node 24, pnpm 10 and a checkout of [github.com/Enoch208/selo](https://github.com/Enoch208/selo).

```bash
pnpm install --frozen-lockfile
API=https://api.useselo.xyz
URL=https://your-domain.example/your/paid/route
```

**1. Authorize your route (free).** Selo gives you one line to serve from your own origin:

```bash
pnpm selo auth create --api $API --url $URL --method POST --project <name> --contact <email>
```

Serve the printed `selo-verification=…` line at `https://your-domain.example/.well-known/selo-verification.txt`
(the file may hold several lines), then:

```bash
pnpm selo auth verify --api $API --authorization auth_…
```

**2. Preflight (free).** It checks your 402, the network and asset, and your price against Selo's
budget, and shows what the test will cost:

```bash
pnpm selo preflight --api $API --authorization auth_… --url $URL --method POST --body body.json
```

**3. Declare your contract.** Write `contract.json` with the status, content type and JSON Schema a
paid response must satisfy:

```json
{
  "status": 200,
  "contentType": "application/json",
  "jsonSchema": {
    "type": "object",
    "required": ["id"],
    "properties": { "id": { "type": "string" } }
  }
}
```

**4. Run the paid release test.** Use a wallet that holds a little USDC and is opted in to it:

```bash
SELO_PAYER_MNEMONIC="…" pnpm selo test --api $API --authorization auth_… --url $URL --method POST \
  --body body.json --contract contract.json --release <your git sha> \
  --network mainnet --max-usdc 1.00 --approve-mainnet --pay-to <Selo payTo shown by preflight> \
  --summary selo-gate.json --attestation selo-attestation.json
```

Any x402 client can pay `POST /v1/release-test` instead. The CLI just adds safe recovery,
attestation saving and exit codes for CI.

## Reading the result

| Exit | Verdict      | Meaning                                                                                                              |
| ---- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `0`  | PASS         | All five checks passed with evidence: handshake, paid delivery, response contract, discovery contract, retry safety  |
| `1`  | FAIL         | A check proved a defect. The summary names the check and the reason, for example `response_contract SCHEMA_MISMATCH` |
| `2`  | INCONCLUSIVE | Something could not be proven, for example a facilitator or catalog outage or an unconfirmed payment. Not a PASS     |
| `3`  | —            | Refused before paying: invalid input, missing authorization or an ineligible preflight                               |

The terminal shows each check, the job id, and the transaction where you paid Selo and the one
where Selo paid you. The private report link is kept in `.selo/runs/<release>.json`.
`selo-attestation.json` is signed by Selo and safe to share. Anyone can verify it with
`pnpm selo verify` against the keys at `https://api.useselo.xyz/.well-known/selo-attestation-keys.json`.

## Sharing your result

If you are happy to share, open an issue at
[github.com/Enoch208/selo/issues](https://github.com/Enoch208/selo/issues) with:

- the endpoint you tested, or an anonymized description;
- who ran and paid for the test;
- the verdict, and the attestation file if you like;
- a sentence about what Selo caught or confirmed.

Nothing is published about your endpoint without your explicit permission.
