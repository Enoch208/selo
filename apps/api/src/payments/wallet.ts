import { toClientAvmSigner } from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import algosdk from "algosdk";

export class InvalidMnemonic extends Error {
  override readonly name = "InvalidMnemonic";

  constructor() {
    super("operating wallet mnemonic is invalid");
  }
}

function accountOf(mnemonic: string): algosdk.Account {
  try {
    return algosdk.mnemonicToSecretKey(mnemonic);
  } catch {
    throw new InvalidMnemonic();
  }
}

export function operatingAddress(mnemonic: string): string {
  const account = accountOf(mnemonic);
  account.sk.fill(0);
  return account.addr.toString();
}

export function createAvmPaymentScheme(mnemonic: string, algodUrl: string): ExactAvmScheme {
  const account = accountOf(mnemonic);
  const signer = toClientAvmSigner(Buffer.from(account.sk).toString("base64"));
  account.sk.fill(0);
  return new ExactAvmScheme(signer, { algodUrl });
}
