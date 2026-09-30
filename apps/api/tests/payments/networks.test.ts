import { describe, expect, it } from "vitest";
import { seloNetworks } from "../../src/payments/networks";

describe("seloNetworks", () => {
  it("uses the long genesis-hash CAIP-2 form the facilitator accepts", () => {
    expect(seloNetworks["algorand-mainnet"].caip2).toBe(
      "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    );
    expect(seloNetworks["algorand-testnet"].caip2).toBe(
      "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
    );
  });

  it("names the USDC asset and algod endpoint for each network", () => {
    expect(seloNetworks["algorand-mainnet"]).toMatchObject({
      usdcAssetId: "31566704",
      algodUrl: "https://mainnet-api.algonode.cloud",
    });
    expect(seloNetworks["algorand-testnet"]).toMatchObject({
      usdcAssetId: "10458941",
      algodUrl: "https://testnet-api.algonode.cloud",
    });
  });
});
