import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { buildOptInTxn, envKeyFor, holdingSummary, optInGate } from "../../src/tools/account-chain";

const params: algosdk.SuggestedParams = {
  flatFee: false,
  fee: 0,
  minFee: 1_000,
  firstValid: 10,
  lastValid: 1_010,
  genesisID: "testnet-v1.0",
  genesisHash: new Uint8Array(Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64")),
};

describe("envKeyFor", () => {
  it("maps each role to its own mnemonic key", () => {
    expect(envKeyFor("client")).toBe("SELO_CLIENT_MNEMONIC");
    expect(envKeyFor("operator")).toBe("SELO_OPERATOR_MNEMONIC");
  });
});

describe("optInGate", () => {
  it("allows Testnet and refuses Mainnet without approval", () => {
    expect(optInGate("algorand-testnet", false)).toEqual({ ok: true });
    expect(optInGate("algorand-mainnet", false)).toMatchObject({ ok: false });
    expect(optInGate("algorand-mainnet", true)).toEqual({ ok: true });
  });
});

describe("buildOptInTxn", () => {
  it("builds a 0-amount self transfer of the USDC asset", () => {
    const address = algosdk.generateAccount().addr.toString();
    const txn = buildOptInTxn(address, "10458941", params);
    expect(txn.type).toBe(algosdk.TransactionType.axfer);
    expect(txn.sender.toString()).toBe(address);
    expect(txn.assetTransfer?.receiver.toString()).toBe(address);
    expect(txn.assetTransfer?.amount).toBe(0n);
    expect(txn.assetTransfer?.assetIndex).toBe(10458941n);
    expect(txn.assetTransfer?.closeRemainderTo).toBeUndefined();
  });
});

describe("holdingSummary", () => {
  it("reports balances and the opt-in state of the USDC asset", () => {
    const account = {
      amount: 2_500_000n,
      minBalance: 200_000n,
      assets: [
        { assetId: 1n, amount: 9n },
        { assetId: 10458941n, amount: 1_230_000n },
      ],
    };
    expect(holdingSummary(account, "10458941")).toEqual({
      algo: "2.50",
      minBalanceAlgo: "0.20",
      usdcOptedIn: true,
      usdc: "1.23",
    });
  });

  it("reports an account that has not opted in", () => {
    expect(holdingSummary({ amount: 0n, minBalance: 100_000n }, "10458941")).toEqual({
      algo: "0.00",
      minBalanceAlgo: "0.10",
      usdcOptedIn: false,
      usdc: null,
    });
  });
});
