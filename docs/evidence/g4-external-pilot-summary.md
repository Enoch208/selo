# External pilot summary

## ORA Gate — 2026-09-27

- **Endpoint:** `POST https://ora-gate-mainnet.vercel.app/api/ora-gate/message/ora_agent` (0.01 USDC, Algorand Mainnet).
- **Permission:** the owner offered the endpoint for testing, asked to be contacted before any paid test, approved the paid run, and agreed to be named.
- **Release job:** `job_GY5X6P4A3FSVXDEQ2VXP4EWAGR`.
- **Inbound payment to Selo:** `JXU2INATXUJHE7WZGGWN25BPM6L2YEL6Q7LU5W3HICI4B5CX4JAQ` (1.00 USDC, round 65454635). This was the one owner-funded go-live payment, not paid by ORA Gate.
- **Selo's payment to ORA Gate:** `ATF5HLYBBY4G5GYPNLCUMC5FXH22WIXI2QG3YP7M4WYPA5EHQTYQ` (0.01 USDC, round 65454637).
- **Checks:** handshake PASS, paid delivery PASS, response contract PASS, discovery contract WARN (not yet catalogued at the time), retry safety FAIL.
- **About the retry result:** the endpoint requires a payment identifier and replays the stored result for a repeated payment. The replay returned ORA Gate's stored result without a new settlement. The version of Selo's check used in this run did not compare the replayed body with the original response, so it could not tell a stored result from a second delivery and reported a possible duplicate. The owner confirmed the message was delivered only once. The check has since been changed to credit a byte-identical stored result as a safe retry. The original report is kept unchanged.
- **Payment identifier:** this endpoint was the first to require the `payment-identifier` extension; Selo added support for it before the paid run.

## ORA Gate retest — 2026-09-30

- **Release job:** `job_ZP2BC5G5PD398EHYYNW90XX02W`, verdict **PASS**.
- **Inbound payment to Selo:** `M7UBNUG4M6XAQBT7NBUFVDMCRGIK4IGYDUGLLATB5ADAS3RLMDTQ` (1.00 USDC, round 65538170), paid by the Selo team's own customer wallet to verify the updated retry check live. It is not an external payment.
- **Selo's payment to ORA Gate:** `S2NOVVRDZUPTY7AA3BZ3NDISYPNXNDMXEKX442SVNR7RXQCP3W7Q` (0.01 USDC).
- **Checks:** handshake, paid delivery, response contract, discovery contract (consistent with the Bazaar listing) and retry safety (`PASS_SAFE_RETRY`) all PASS.
