import { SafeFetchError, type SafeFetchBlockReason } from "../net/safe-fetch";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type TransportFailure =
  | { readonly kind: "blocked"; readonly reason: SafeFetchBlockReason }
  | { readonly kind: "timeout" }
  | { readonly kind: "network_error"; readonly message: string };

export function messageChain(error: unknown): string {
  const messages: string[] = [];
  for (let current = error; current !== undefined && messages.length < 4;) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else {
      messages.push(typeof current === "string" ? current : `non-error ${typeof current}`);
      current = undefined;
    }
  }
  return messages.join(": ");
}

export function withDeadline<T>(pending: Promise<T>, deadline: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(deadline.reason instanceof Error ? deadline.reason : new Error("deadline exceeded"));
    };
    if (deadline.aborted) {
      onAbort();
      return;
    }
    deadline.addEventListener("abort", onAbort, { once: true });
    pending.then(resolve, reject).finally(() => {
      deadline.removeEventListener("abort", onAbort);
    });
  });
}

export class BodyDiscardFailed extends Error {
  override readonly name = "BodyDiscardFailed";
}

export function transportFailure(error: unknown, deadline: AbortSignal): TransportFailure | null {
  if (error instanceof BodyDiscardFailed) {
    return { kind: "network_error", message: messageChain(error) };
  }
  if (error instanceof SafeFetchError) {
    const { failure } = error;
    if (failure.kind === "network") {
      return { kind: "network_error", message: messageChain(error) };
    }
    return failure;
  }
  return deadline.aborted ? { kind: "timeout" } : null;
}

export type BeforeSendFailure =
  | { readonly kind: "blocked"; readonly reason: SafeFetchBlockReason }
  | { readonly kind: "network_error_before_send"; readonly message: string };

export function failedBeforeSend(error: unknown): BeforeSendFailure | null {
  if (!(error instanceof SafeFetchError) || error.afterDispatch) {
    return null;
  }
  const { failure } = error;
  if (failure.kind === "blocked") {
    return failure;
  }
  return { kind: "network_error_before_send", message: messageChain(error) };
}

export interface Exchange {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

export function sendBefore(
  fetch: FetchLike,
  exchange: Exchange,
  deadline: AbortSignal,
): Promise<Response> {
  const content = exchange.body === null ? {} : { "content-type": "application/json" };
  const init: RequestInit = {
    method: exchange.method,
    headers: { ...exchange.headers, ...content },
    redirect: "manual",
    signal: deadline,
    ...(exchange.body === null ? {} : { body: exchange.body }),
  };
  return withDeadline(fetch(exchange.url, init), deadline);
}

export async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch (error: unknown) {
    throw new BodyDiscardFailed("response body could not be discarded", { cause: error });
  }
}
