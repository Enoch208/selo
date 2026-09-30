import type { AuthorizationView, PreflightBody, PreflightEligible } from "@selo/core";
import { useState, type SyntheticEvent } from "react";
import { postJson, type ApiFailure } from "../../lib/api";
import { preflightSchema } from "../../lib/wire";
import { FailureNotice } from "../ui/failure-notice";
import { FloatingField } from "../ui/floating-field";
import { PrimaryButton } from "../ui/primary-button";
import { parseRequestBody, type ParsedBody } from "./request-body";

interface PreflightStepProps {
  readonly authorization: AuthorizationView;
  readonly onEligible: (preflight: PreflightEligible) => void;
}

type Outcome =
  | { readonly kind: "failure"; readonly failure: ApiFailure }
  | { readonly kind: "ineligible"; readonly reason: string; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string };

export function PreflightStep({ authorization, onEligible }: PreflightStepProps) {
  const [targetUrl, setTargetUrl] = useState(`${authorization.origin}${authorization.routePath}`);
  const [bodyText, setBodyText] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body: ParsedBody =
      authorization.method === "POST" ? parseRequestBody(bodyText) : { ok: true, value: undefined };
    if (!body.ok) {
      setOutcome({ kind: "invalid", message: body.message });
      return;
    }
    const request: PreflightBody = {
      authorizationId: authorization.authorizationId,
      targetUrl: targetUrl.trim(),
      method: authorization.method,
      ...(body.value === undefined ? {} : { requestBody: body.value }),
    };
    setPending(true);
    setOutcome(null);
    const result = await postJson("/v1/preflight", request, preflightSchema);
    setPending(false);
    if (!result.ok) {
      setOutcome({ kind: "failure", failure: result.failure });
    } else if (result.data.eligible) {
      onEligible(result.data);
    } else {
      setOutcome({ kind: "ineligible", reason: result.data.reason, message: result.data.message });
    }
  }

  return (
    <form
      className="space-y-10"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <p className="text-sm leading-relaxed text-zinc-300">
        Free. Selo makes one unpaid {authorization.method} request, reads the 402 and checks the
        price against the job budget. Nothing is paid.
      </p>
      <FloatingField
        id="preflight-target"
        label="Target URL"
        type="url"
        required
        value={targetUrl}
        onChange={setTargetUrl}
      />
      {authorization.method === "POST" ? (
        <div>
          <label
            htmlFor="preflight-body"
            className="mb-3 block font-sans text-xs font-medium uppercase tracking-wider text-zinc-400"
          >
            Request body (optional JSON)
          </label>
          <textarea
            id="preflight-body"
            rows={5}
            value={bodyText}
            spellCheck={false}
            onChange={(event) => {
              setBodyText(event.target.value);
            }}
            placeholder={'{ "message": "hello" }'}
            className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 p-4 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none"
          />
        </div>
      ) : null}
      {outcome === null ? null : outcome.kind === "failure" ? (
        <FailureNotice failure={outcome.failure} />
      ) : (
        <div role="alert" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-100">
            {outcome.kind === "ineligible" ? "Not testable yet" : "Check the request body"}
          </p>
          <p className="mt-1 text-sm text-amber-100/80">{outcome.message}</p>
          {outcome.kind === "ineligible" ? (
            <p className="mt-2 font-mono text-xs text-amber-200/70">{outcome.reason}</p>
          ) : null}
        </div>
      )}
      <div className="flex justify-end">
        <PrimaryButton type="submit" pending={pending}>
          {pending ? "Running preflight…" : "Run free preflight"}
        </PrimaryButton>
      </div>
    </form>
  );
}
