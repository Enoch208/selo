import type { IndexerFetch } from "../../src/reconcile/indexer";

export type IndexerMode = "answer" | "http_503" | "hang" | "not_json" | "malformed";

export type ChainJson = Readonly<Record<string, unknown>>;

export class FakeIndexer {
  currentRound = 1_500;
  mode: IndexerMode = "answer";
  readonly requests: string[] = [];
  readonly #transactions = new Map<string, ChainJson>();
  #barrier = 0;
  #waiting: (() => void)[] = [];

  reset(): void {
    this.currentRound = 1_500;
    this.mode = "answer";
    this.requests.length = 0;
    this.#transactions.clear();
    this.#barrier = 0;
    this.#waiting = [];
  }

  record(transaction: ChainJson & { readonly id: string }): void {
    this.#transactions.set(transaction.id, transaction);
  }

  answerTogetherAfter(requests: number): void {
    this.#barrier = requests;
  }

  async #arrive(): Promise<void> {
    if (this.requests.length >= this.#barrier) {
      for (const release of this.#waiting.splice(0)) {
        release();
      }
      return;
    }
    await new Promise<void>((resolve) => {
      this.#waiting.push(resolve);
    });
  }

  readonly fetch: IndexerFetch = async (url, init) => {
    this.requests.push(url);
    await this.#arrive();
    if (this.mode === "hang") {
      return new Promise<Response>((_, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(init.signal.reason instanceof Error ? init.signal.reason : new Error("aborted"));
        });
      });
    }
    if (this.mode === "http_503") {
      return new Response("upstream busy", { status: 503 });
    }
    if (this.mode === "not_json") {
      return new Response("<html>maintenance</html>", { status: 200 });
    }
    if (this.mode === "malformed") {
      return Response.json({ transactions: "none", "current-round": "soon" });
    }
    const txId = new URL(url).searchParams.get("txid") ?? "";
    const found = this.#transactions.get(txId);
    return Response.json({
      "current-round": this.currentRound,
      "next-token": "",
      transactions: found === undefined ? [] : [found],
    });
  };
}
