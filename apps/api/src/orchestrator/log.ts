import { sanitize } from "../evidence/sanitize";
import { messageChain } from "../payments/transport";

export interface LogFields {
  readonly event: string;
  readonly jobId: string;
  readonly requestId?: string | null;
  readonly scenarioId?: string | null;
  readonly operationId?: string | null;
  readonly targetOrigin?: string | null;
  readonly durationMs?: number | null;
  readonly incomingTxId?: string | null;
  readonly downstreamTxId?: string | null;
  readonly amountUsdc?: string | null;
  readonly status?: string | null;
  readonly failureCode?: string | null;
}

const emptyFields = {
  requestId: null,
  scenarioId: null,
  operationId: null,
  targetOrigin: null,
  durationMs: null,
  incomingTxId: null,
  downstreamTxId: null,
  amountUsdc: null,
  status: null,
  failureCode: null,
} as const;

export function logEvent(fields: LogFields): void {
  process.stdout.write(`${JSON.stringify({ ...emptyFields, ...fields })}\n`);
}

export function describeError(error: unknown): string {
  return String(sanitize(messageChain(error))).replace(/\s+/g, " ");
}

export function alert(
  event: string,
  jobId: string,
  detail: Readonly<Record<string, string | number | null>> = {},
): void {
  const parts = Object.entries(detail).map(
    ([key, value]) => ` ${key}=${String(sanitize(String(value))).replace(/\s+/g, " ")}`,
  );
  process.stderr.write(`ALERT event=${event} jobId=${jobId}${parts.join("")}\n`);
}
