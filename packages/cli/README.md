# selo CLI

`selo` runs a Selo release test from a terminal or a CI job and turns the verdict into an exit
code a pipeline can trust. It pays Selo once with a dedicated, capped wallet. Selo then pays your
x402 endpoint as a real client, runs the five release checks and returns the report. The CLI blocks
the release unless every check passed with evidence.

## Install and run

From a checkout of this repository (Node 24, pnpm 10):

```bash
pnpm install --frozen-lockfile
pnpm selo --help
```

`pnpm selo …` works from anywhere inside the checkout. Relative paths are resolved from the
directory you run it in.

## The four steps

```bash
API=https://api.useselo.xyz
URL=https://staging.example.com/v1/orders

# 1. Prove you own the route (free). Serve the printed line at /.well-known/selo-verification.txt
pnpm selo auth create --api $API --url $URL --method POST --project shop --contact you@example.com
pnpm selo auth verify --api $API --authorization auth_…

# 2. Check price, payment terms and eligibility before paying (free)
pnpm selo preflight --api $API --authorization auth_… --url $URL --method POST --body order.json

# 3. Pay for the release test and gate on the verdict
SELO_PAYER_MNEMONIC="…" pnpm selo test \
  --api $API --authorization auth_… --url $URL --method POST --body order.json \
  --contract contract.json --release "$GIT_SHA" \
  --network mainnet --max-usdc 1.00 --approve-mainnet --pay-to <Selo payTo> \
  --summary selo-gate.json
```

An authorization lasts 24 hours after verification, and a preflight lasts 15 minutes.
`selo test` runs its own fresh preflight on every run.

## The release contract

`--contract` is a JSON file with the shape of the `expected` field of `POST /v1/release-test`:

```json
{
  "status": 200,
  "contentType": "application/json",
  "jsonSchema": {
    "type": "object",
    "required": ["receiptId"],
    "properties": { "receiptId": { "type": "string" } }
  }
}
```

The schema is compiled in strict mode before anything is paid. A schema that does not compile
exits 3. For example, every name in `required` must also appear under `properties`.

## Exit codes

| Exit | Meaning                                                                              | Gate  |
| ---- | ------------------------------------------------------------------------------------ | ----- |
| `0`  | PASS on all five checks, each with evidence, with both payment legs in the report    | ALLOW |
| `1`  | FAIL proven by a release check                                                       | BLOCK |
| `2`  | INCONCLUSIVE, unconfirmed payment, missing or inconsistent report, transient failure | BLOCK |
| `3`  | Invalid input, authorization missing, preflight ineligible, payment not approved     | BLOCK |

The CLI does not trust the verdict label alone. It recomputes the verdict from the report's own
checks with the same pure reducer Selo uses. A disagreement, a missing check, a check without
evidence or a missing transaction blocks with exit 2. An unexpected error also exits 2. It never
exits 0.

## Payment safety

- **One payment per run, never retried automatically.** Selo deduplicates by `Idempotency-Key`,
  and the CLI derives the key from the preflight and the payer.
- **Every price is shown before signing.** That covers the target's price, Selo's cap on what it
  spends on the target, Selo's own price, the network, the payee and your budget.
- **Refused before signing:**
  - a 402 on a network other than `--network`;
  - a price above `--max-usdc`;
  - a payee other than `--pay-to`;
  - any Mainnet payment without `--approve-mainnet` and `--pay-to`.
- **Unconfirmed outcomes stop spending.** If an outcome is unconfirmed (a timeout, a lost
  connection, a held settlement), the attempt is recorded in `.selo/runs/<release>.json`, and
  further runs for that release refuse to pay. Rerun the same command with `--resume` to fetch the
  result: it reuses the same preflight and `Idempotency-Key`, and Selo never settles a duplicate.
  Resuming works while the preflight is still valid (15 minutes). After that, check the payer
  account for the expected transaction id the CLI printed.
- **Secrets stay out of output.** The mnemonic is read from `SELO_PAYER_MNEMONIC` only and is never
  printed or written. Signed payments are never printed. The private report link is redacted in
  terminal output and in summaries; the full link is kept only in the run state file (mode 600),
  which you should never upload.

Use a dedicated payer wallet that holds only what a few release tests cost, and opt it in to USDC
(ASA 31566704 on Mainnet, 10458941 on Testnet).

## Signed attestations

When Selo is configured with an attestation key, every release test answer carries a signed
attestation. Pass `--attestation selo-attestation.json` to `selo test` to save it. It holds no
secret and is safe to publish.

The attestation is an envelope `{ payload, signature }`. The payload records:

- the job, the tested URL and method, and the release you asserted (`deployment.id`, marked
  `asserted_by_client`);
- the verdict, every check with its status, code and evidence ids;
- both payment legs with their transaction ids;
- a SHA-256 of the release contract and of the target's 402;
- a manifest of the evidence rows with their hashes.

The signature is Ed25519 over the payload's canonical JSON (keys sorted, no whitespace,
RFC 8785 style), so it never covers itself. Selo publishes its keys at
`/.well-known/selo-attestation-keys.json`.

```bash
pnpm selo verify --attestation selo-attestation.json --keys selo/attestation-keys.json \
  --release "$GIT_SHA" --url $URL --method POST
```

`selo verify` exits with the attested verdict (`0` PASS, `1` FAIL, `2` INCONCLUSIVE). It exits 2
in any of these cases:

- the signature does not verify;
- the key is not in your trusted set;
- the file is not an attestation;
- the attestation names another release, URL or method. A PASS for one commit cannot unlock
  another.

Pin the keys. Download them once, review them, and commit them, instead of trusting a URL taken
from the attestation itself.

## What `--release` means

`--release` names the build you are testing, for example a Git SHA. Selo does not verify it. The
summary records it as `asserted_by_client`, and it keys the local recovery state.

## Outputs

- **Terminal:** the terms, the result of each check, the job id and both transaction ids.
- **`--summary <file>`:** the `selo.gate.v1` JSON, sanitized and safe to upload as a CI artifact.
- **`GITHUB_STEP_SUMMARY`:** when set, the same summary is appended as a Markdown table.

## Scope

`quick` profile, `GET` and `POST`, Algorand USDC on Mainnet or Testnet. Any other method or
network exits 3.
