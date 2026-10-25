# Gate a release on Selo in GitHub Actions

[`release-gate.yml`](release-gate.yml) is a complete workflow you can copy. It promotes a commit to
production only after Selo has paid the staged release as a real x402 client and every release
check passed with evidence. A FAIL, an INCONCLUSIVE, an unconfirmed payment, an expired
authorization or a missing report fails the paid job, and the promote job never runs.

```text
push to main ──► stage ─────────────► paid-gate ──────────────────► promote
                 build, deploy        environment: selo-paid-release  runs only if the gate
                 staging, free        (required reviewers) pays Selo  output is ALLOW, then
                 preflight            once; exit 0 only on PASS;      verifies the signed
                                      saves the signed attestation    attestation offline
```

The workflow uses the composite action in
[`.github/actions/release-gate`](../../.github/actions/release-gate/action.yml), which runs the
[`selo` CLI](../../packages/cli/README.md).

## Setup

1. **Create a dedicated payer wallet.** Opt it in to USDC (ASA 31566704 on Mainnet) and fund it
   with only what a few release tests cost. A release test costs Selo's price, 1.00 USDC today.
   Selo pays the target's own price from its wallet.
2. **Authorize the staging route.** Run `selo auth create` for the exact URL and method. Serve the
   printed line at `https://<staging origin>/.well-known/selo-verification.txt`; the file may hold
   several lines. Then run `selo auth verify`. An authorization is valid for 24 hours after it is
   verified, so authorize again before a release window.
3. **Add the configuration.**
   - In **Settings → Environments**, create `selo-paid-release`. Add required reviewers, limit it
     to the `main` branch, and add the secret `SELO_PAYER_MNEMONIC` there. Make it an environment
     secret, not a repository secret.
   - Add the repository variables `SELO_AUTHORIZATION_ID` (`auth_…`) and `SELO_PAY_TO` (Selo's
     payee, as shown in its 402 and in `selo preflight`).
4. **Commit your contract** as `selo/contract.json` and, for POST, the request body as
   `selo/order.json`. The demo merchant ships an example of each in
   [`examples/merchant`](../merchant).
5. **Pin Selo's attestation key.** Download
   `https://api.useselo.xyz/.well-known/selo-attestation-keys.json` once, review it, and commit it
   as `selo/attestation-keys.json`. The promote job verifies the signed attestation against this
   file, so it promotes only a PASS that Selo signed for this exact commit, URL and method.
6. **Pin the action.** Replace `@main` with a commit SHA of this repository that you have reviewed.

## What keeps the payment wallet safe

- The paid job runs only on `push` to `main` or a manual dispatch, inside a protected environment,
  so it waits for a reviewer. Pull requests, including those from forks, never reach it. Do not add
  `pull_request_target` to this workflow.
- The free `stage` job needs no wallet and spends nothing; it only checks authorization, terms and
  eligibility.
- `max-usdc` caps what one run may pay. The action refuses a 402 on another network, a different
  payee, or Mainnet without `approve-mainnet`, all before signing.
- The action never retries a payment. If the outcome is unconfirmed, it exits 2 with a warning.
  **Do not re-run the job blindly**: a re-run starts a new paid test. Check the payer account for
  the expected transaction id printed in the log first.
- Logs, the job summary and the uploaded `selo-gate.json` contain no mnemonic, no signed payment and
  no private report token. Do not upload the `.selo/` directory, because it holds the private report
  link.

## Outputs

| Output      | Values                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| `exit-code` | `0` PASS, `1` FAIL, `2` INCONCLUSIVE or unconfirmed, `3` refused before paying |
| `gate`      | `ALLOW` only for a fully evidenced PASS, otherwise `BLOCK`                     |
| `verdict`   | `PASS`, `FAIL`, `INCONCLUSIVE`, or `none` when no report came back             |

The job summary shows the verdict, each check, the job id and both transaction ids. You can look
the transaction ids up on any Algorand explorer.
