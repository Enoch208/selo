export function paySnippet(origin: string, preflightId: string, seloPriceUsdc: string): string {
  return [
    `import algosdk from "algosdk";`,
    `import { toClientAvmSigner } from "@x402/avm";`,
    `import { ExactAvmScheme } from "@x402/avm/exact/client";`,
    `import { x402Client, x402HTTPClient } from "@x402/core/client";`,
    ``,
    `const { sk } = algosdk.mnemonicToSecretKey(process.env.PAYER_MNEMONIC ?? "");`,
    `const signer = toClientAvmSigner(Buffer.from(sk).toString("base64"));`,
    `const http = new x402HTTPClient(`,
    `  new x402Client()`,
    `    .register("algorand:*", new ExactAvmScheme(signer))`,
    `    .setSpendControls({ maxAmountPerPayment: "$${seloPriceUsdc}" }),`,
    `);`,
    ``,
    `const url = "${origin}/v1/release-test";`,
    `const headers = { "content-type": "application/json", "idempotency-key": "${preflightId}" };`,
    `const body = JSON.stringify({ preflightId: "${preflightId}", profile: "quick" });`,
    ``,
    `const challenge = await fetch(url, { method: "POST", headers, body });`,
    `if (challenge.status !== 402) throw new Error(await challenge.text());`,
    `const required = http.getPaymentRequiredResponse(`,
    `  (name) => challenge.headers.get(name),`,
    `  await challenge.json(),`,
    `);`,
    `const payment = http.encodePaymentSignatureHeader(await http.createPaymentPayload(required));`,
    `const paid = await fetch(url, { method: "POST", headers: { ...headers, ...payment }, body });`,
    `const result = await paid.json();`,
    `console.log(result.verdict, result.reportUrl);`,
  ].join("\n");
}

export const installCommand = "npm install algosdk @x402/avm@2.27.0 @x402/core@2.27.0";
