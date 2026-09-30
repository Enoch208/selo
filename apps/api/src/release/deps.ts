import type { ReleaseTestResponse } from "@selo/core";
import type { InboundGate } from "../payments/inbound";

export interface ReleaseRunner {
  run(jobId: string): Promise<ReleaseTestResponse>;
  result(jobId: string): Promise<ReleaseTestResponse | null>;
}

export interface ReleaseDeps {
  readonly gate: InboundGate;
  readonly runner: ReleaseRunner;
  readonly jobMaxSpendMicros: number;
  readonly gitSha: string | null;
}
