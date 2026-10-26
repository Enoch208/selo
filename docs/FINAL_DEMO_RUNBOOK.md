# Demo runbook: a healthy release that breaks after payment

This is the end-to-end demonstration of Selo as a release gate:

**HTTP health green → paid response broken → Selo FAIL → deployment blocked → fix → Selo PASS →
deployment allowed → verified on-chain receipts.**

The target is the demo merchant at `https://demo.useselo.xyz/v1/orders`
([`examples/merchant`](../examples/merchant/README.md)). Selo is the production API at
`https://api.useselo.xyz` on Algorand Mainnet.

## What you need

|               |                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Checkout      | This repository, Node 24, `pnpm install --frozen-lockfile`                                                                           |
| Payer wallet  | An Algorand account opted in to USDC (ASA 31566704) holding 1.00 USDC per paid run, exported as `SELO_PAYER_MNEMONIC`. Never printed |
| Merchant host | Shell access to the host running `selo-demo-merchant`, to switch releases                                                            |
| Selo's payee  | `N37HMJCB4BAITC2ZU7C4XW7PUMCO4T3TUASHQEL6A4EWMLOTTHOB7IOOKY`, the payTo in Selo's 402                                                |

## Commands

```bash
API=https://api.useselo.xyz
URL=https://demo.useselo.xyz/v1/orders
PAYTO=N37HMJCB4BAITC2ZU7C4XW7PUMCO4T3TUASHQEL6A4EWMLOTTHOB7IOOKY
```

**1. Health is green.**

```bash
curl -s https://demo.useselo.xyz/health
# {"status":"ok","release":"broken-v1"}
```

**2. Authorize the route (free).** Selo prints a line that the merchant serves at
`/.well-known/selo-verification.txt`. Write it to the file named by `SELO_VERIFICATION_FILE` on the
merchant host, then verify:

```bash
pnpm selo auth create --api $API --url $URL --method POST --project selo-demo-merchant --contact demo@useselo.xyz
pnpm selo auth verify --api $API --authorization auth_…
```

**3. Test the broken release (1.00 USDC).**

```bash
pnpm selo test --api $API --authorization auth_… --url $URL --method POST \
  --body examples/merchant/order.json --contract examples/merchant/contract.json \
  --release broken-v1 --network mainnet --max-usdc 1.00 --approve-mainnet --pay-to $PAYTO \
  --summary broken-v1.json --attestation broken-v1-attestation.json
echo $?   # 1
```

Expected output: `response_contract FAIL SCHEMA_MISMATCH`, then
`gate BLOCK (exit 1): FAIL: response_contract`.

**4. Ship the fix** on the merchant host:

```bash
sed -i 's/^MERCHANT_RELEASE=.*/MERCHANT_RELEASE=fixed-v2/' /srv/selo-demo/merchant.env
systemctl restart selo-demo-merchant
curl -s https://demo.useselo.xyz/health   # {"status":"ok","release":"fixed-v2"}
```

**5. Test the fixed release (1.00 USDC).** Run the same command with `--release fixed-v2` and
`fixed-v2` file names. Expected: all five checks PASS, then
`gate ALLOW (exit 0): PASS on every release check`.

**6. Verify both verdicts offline.**

```bash
pnpm selo verify --attestation broken-v1-attestation.json --keys docs/evidence/selo-attestation-keys.json \
  --release broken-v1 --url $URL --method POST   # exit 1, verdict FAIL
pnpm selo verify --attestation fixed-v2-attestation.json --keys docs/evidence/selo-attestation-keys.json \
  --release fixed-v2 --url $URL --method POST    # exit 0, verdict PASS
```

**7. Gate the deployment in GitHub Actions.** Run **Actions → Release gate demo → Run workflow**
twice, once with `broken-v1` and once with `fixed-v2`. The workflow verifies the committed signed
attestation against the pinned key: `broken-v1` fails the gate and skips promotion, and
`fixed-v2` passes and promotes.

## The recorded Mainnet run (26 October 2026)

|                                    | broken-v1                                                                                                                       | fixed-v2                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                      | 200 `{"status":"ok","release":"broken-v1"}`                                                                                     | 200 `{"status":"ok","release":"fixed-v2"}`                                                                                     |
| Verdict                            | **FAIL**                                                                                                                        | **PASS**                                                                                                                       |
| Checks                             | handshake PASS · paid delivery PASS · **response contract FAIL `SCHEMA_MISMATCH`** · discovery INCONCLUSIVE · retry safety PASS | all five PASS: `HANDSHAKE_VALID` · `PAID_AND_DELIVERED` · `CONTRACT_MATCHED` · `DISCOVERY_CONSISTENT` · `PASS_REPLAY_REJECTED` |
| CLI                                | exit **1**, gate BLOCK                                                                                                          | exit **0**, gate ALLOW                                                                                                         |
| Job                                | `job_189NZ481HFH77CRGF60AEF22RG`                                                                                                | `job_51AZ2WJZ78RF1WZC316Q1K38GG`                                                                                               |
| Selo was paid (1.00 USDC)          | [`SVGTX3U6…YVIEQ`](https://allo.info/tx/SVGTX3U6XQLSGJP7L7X7KNPSDLWFBSA3JK7AFNHPWENIWP4YVIEQ), round 66348324                   | [`EPBEZR22…UIJA`](https://allo.info/tx/EPBEZR22SZ5LYKFM7UJYCSFG5IWNA6QYZ6XHUA6KGTTDDQQ5UIJA), round 66349222                   |
| Selo paid the merchant (0.01 USDC) | [`RZR6XUIA…DOLQ`](https://allo.info/tx/RZR6XUIA3GTHW6ABAHUIXRDCNYYXIHQVQYGN2T5PAMDO37DDDOLQ), round 66348326                    | [`QEUF5D33…E3ZQ`](https://allo.info/tx/QEUF5D33T4YHYP3KKIY2PGCYF55XXSUYKS5GXFBAVAZ4IEZOE3ZQ), round 66349225                   |
| Signed attestation                 | [`g5-release-gate-broken-v1-attestation.json`](evidence/g5-release-gate-broken-v1-attestation.json)                             | [`g5-release-gate-fixed-v2-attestation.json`](evidence/g5-release-gate-fixed-v2-attestation.json)                              |
| `selo verify`                      | exit 1 (FAIL, signature valid)                                                                                                  | exit 0 (PASS, signature valid); exit 2 when presented as broken-v1                                                             |

In the broken-v1 run, discovery was INCONCLUSIVE. Selo could not read the Bazaar catalog at the
time; it had grown past what the lookup read. The proven contract FAIL decides the verdict
regardless. Two earlier fixed-v2 attempts that day returned **INCONCLUSIVE** for the same reason:
every other check passed, and Selo still refused to call it PASS without the discovery proof. The
catalog lookup was then fixed to search by payee, and the fixed-v2 run above passed all five
checks.

## Demo script (about 2½ minutes)

| Time | Show                                                                                 | Say                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | `curl https://demo.useselo.xyz/health` → 200, `broken-v1`                            | "This x402 endpoint is healthy. Every uptime check is green."                                                                                         |
| 0:15 | `curl -X POST …/v1/orders` → 402                                                     | "It sells an order for 0.01 USDC on Algorand. The 402 is valid too."                                                                                  |
| 0:25 | `pnpm selo test … --release broken-v1`                                               | "Before releasing, Selo buys from it: I pay Selo 1.00 USDC, and only after that settles does Selo pay the merchant as a real client."                 |
| 0:50 | The output: `response_contract FAIL SCHEMA_MISMATCH`, gate BLOCK, exit 1             | "The payment settled and the response was a 200, but the receipt renamed `receiptId`. Every buyer's integration would break. Selo fails the release." |
| 1:10 | GitHub Actions → Release gate demo → `broken-v1`: the gate fails, promote is skipped | "In CI, that signed FAIL blocks the deploy."                                                                                                          |
| 1:25 | Switch the merchant to `fixed-v2` and restart                                        | "Ship the fix."                                                                                                                                       |
| 1:35 | `pnpm selo test … --release fixed-v2` → five PASS, gate ALLOW, exit 0                | "Same URL, paid again: all five checks pass, including the Bazaar listing and the replay check."                                                      |
| 1:55 | GitHub Actions → `fixed-v2`: the gate passes, promote runs                           | "The signed PASS for this exact release unlocks the deploy. The same PASS can't unlock any other release."                                            |
| 2:10 | allo.info: the two transactions, three rounds apart                                  | "Both payments are on Algorand Mainnet, in order: Selo was paid first, then it paid the merchant."                                                    |
| 2:25 | `pnpm selo verify` on both attestations                                              | "Anyone can verify these verdicts offline against Selo's published key."                                                                              |

## Likely failure modes

| Symptom                                                         | Cause                                          | What to do                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `exit 3`, `preflight refused … AUTHORIZATION_EXPIRED`           | Authorizations last 24 hours                   | Repeat step 2                                                                        |
| `exit 3`, `above the approved budget`                           | Selo's price changed                           | Check it with `pnpm selo preflight`, then raise `--max-usdc` deliberately            |
| `exit 3`, `Selo did not accept the payment`                     | The payer lacks USDC or is not opted in        | Fund the payer and run `account:status`                                              |
| `exit 2`, `discovery_contract INCONCLUSIVE CATALOG_UNAVAILABLE` | The Bazaar catalog could not be read           | Selo refuses to call PASS without that proof. Retry later                            |
| `exit 2` with "unconfirmed paid run"                            | A response was lost after the payment was sent | Do **not** start a new run. Rerun the same command with `--resume` within 15 minutes |

## Offline fallback for the recording

If the network or the facilitator is unavailable while recording, use the repository alone. It
needs no wallet, spends nothing and uses no network:

```bash
pnpm test --project api tests/e2e/demo-merchant.test.ts tests/e2e/cli-gate.test.ts
pnpm selo verify --attestation docs/evidence/g5-release-gate-broken-v1-attestation.json \
  --keys docs/evidence/selo-attestation-keys.json --release broken-v1 \
  --url https://demo.useselo.xyz/v1/orders --method POST
```

The first command runs the real Selo app, gate, runner and verdict reducer against the demo
merchant's own code, with fakes only for the facilitator, the signer and the chain. Say so on
camera. The second command verifies the signed Mainnet verdict offline.
