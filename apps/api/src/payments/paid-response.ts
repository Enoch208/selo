import { readLimitedText } from "../net/limited-body";
import { readChallenge, readSettlementTxId, type ChallengeRead } from "./challenge-io";
import type { ExpectedTxId } from "./expected-txid";
import { discardBody, withDeadline } from "./transport";

export class ReplayHeader {
  readonly name: string;
  readonly body: string | null;
  readonly #value: string;

  constructor(name: string, value: string, body: string | null) {
    this.name = name;
    this.body = body;
    this.#value = value;
  }

  get value(): string {
    return this.#value;
  }
}

export interface DeliveredBody {
  readonly bodyText: string | null;
  readonly bodyTooLarge: boolean;
  readonly bodyReadFailure: "timeout" | "network" | null;
}

export type AmbiguousOutcome = {
  readonly kind: "ambiguous";
  readonly requestedAt: Date;
  readonly message: string;
} & ExpectedTxId;

export type PaidOutcome =
  | ({
      readonly kind: "rejected";
      readonly status: number;
      readonly requestedAt: Date;
      readonly errorReason: string | null;
      readonly challenge: ChallengeRead;
    } & ExpectedTxId)
  | AmbiguousOutcome
  | ({
      readonly kind: "delivered";
      readonly status: number;
      readonly contentType: string | null;
      readonly txId: string | null;
      readonly settlementHeaderMalformed: boolean;
      readonly requestedAt: Date;
      readonly replayHeader: ReplayHeader;
    } & ExpectedTxId &
      DeliveredBody);

export interface PaidContext {
  readonly requestedAt: Date;
  readonly replayHeader: ReplayHeader;
  readonly expected: ExpectedTxId;
  readonly deadline: AbortSignal;
  readonly maxBodyBytes: number;
}

async function readBody(response: Response, context: PaidContext): Promise<DeliveredBody> {
  const read = await withDeadline(
    readLimitedText(response, context.maxBodyBytes),
    context.deadline,
  ).catch((error: unknown) => ({
    ok: false as const,
    kind: context.deadline.aborted ? ("timeout" as const) : ("network" as const),
    cause: error,
  }));
  if (read.ok) {
    return { bodyText: read.text, bodyTooLarge: false, bodyReadFailure: null };
  }
  if (read.kind === "too_large") {
    return { bodyText: null, bodyTooLarge: true, bodyReadFailure: null };
  }
  return { bodyText: null, bodyTooLarge: false, bodyReadFailure: read.kind };
}

export async function classifyPaidResponse(
  response: Response,
  context: PaidContext,
): Promise<PaidOutcome> {
  const settlement = readSettlementTxId(response);
  const { requestedAt, expected } = context;
  if (response.status === 402 && settlement.txId === null) {
    const challenge = readChallenge(response);
    await discardBody(response);
    if (settlement.malformed) {
      return {
        kind: "ambiguous",
        requestedAt,
        message: "402 with an undecodable PAYMENT-RESPONSE",
        ...expected,
      };
    }
    const errorReason = settlement.errorReason;
    return { kind: "rejected", status: 402, requestedAt, errorReason, challenge, ...expected };
  }
  return {
    kind: "delivered",
    status: response.status,
    contentType: response.headers.get("content-type"),
    txId: settlement.txId,
    settlementHeaderMalformed: settlement.malformed,
    requestedAt,
    replayHeader: context.replayHeader,
    ...expected,
    ...(await readBody(response, context)),
  };
}
