import { checkIds, type CheckId, type CheckResult, type InconclusiveReason } from "@selo/core";
import { notRunCheck } from "../reports/checks";

export interface OpenPayment {
  readonly paymentId: string;
  readonly amountMicros: number;
  readonly requestedAt: Date;
}

export class RunState {
  readonly #checks = new Map<CheckId, CheckResult>();
  #reason: InconclusiveReason | null = null;
  stopSpending = false;
  openPayment: OpenPayment | null = null;

  record(check: CheckResult): CheckResult {
    this.#checks.set(check.id, check);
    return check;
  }

  checks(): readonly CheckResult[] {
    return checkIds.map((id) => this.#checks.get(id) ?? notRunCheck(id));
  }

  inconclusive(reason: InconclusiveReason): void {
    if (this.#reason === null || reason === "PAYMENT_UNRESOLVED") {
      this.#reason = reason;
    }
  }

  get reason(): InconclusiveReason | null {
    return this.#reason;
  }
}
