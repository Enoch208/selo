import type { AuthorizationChallengeView, AuthorizationView, PreflightEligible } from "@selo/core";
import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { z } from "zod";
import { AuthorizationForm } from "../components/authorize/authorization-form";
import { AuthorizeStep } from "../components/test-flow/authorize-step";
import { PayStep } from "../components/test-flow/pay-step";
import { PreflightStep } from "../components/test-flow/preflight-step";
import { ReportLinkStep } from "../components/test-flow/report-link-step";
import { StepCard, type StepState } from "../components/test-flow/step-card";
import { useDocumentTitle } from "../lib/use-document-title";
import { challengeSchema } from "../lib/wire";

const handoffSchema = z.object({ challenge: challengeSchema });
const total = 5;

function stateOf(step: number, active: number): StepState {
  return step < active ? "done" : step === active ? "active" : "locked";
}

export default function TestPage() {
  useDocumentTitle("Test an endpoint · Selo");
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const authorizationId = params.get("authorization");
  const handoff = handoffSchema.safeParse(location.state);
  const [created, setCreated] = useState<AuthorizationChallengeView | null>(null);
  const [verified, setVerified] = useState<AuthorizationView | null>(null);
  const [preflight, setPreflight] = useState<PreflightEligible | null>(null);
  const challenge =
    created?.authorizationId === authorizationId
      ? created
      : handoff.success && handoff.data.challenge.authorizationId === authorizationId
        ? handoff.data.challenge
        : null;

  const onCreated = useCallback(
    (next: AuthorizationChallengeView) => {
      setCreated(next);
      setVerified(null);
      setPreflight(null);
      setParams({ authorization: next.authorizationId });
    },
    [setParams],
  );
  const onVerified = useCallback((next: AuthorizationView) => {
    setVerified(next);
  }, []);
  const restart = useCallback(() => {
    setCreated(null);
    setVerified(null);
    setPreflight(null);
    setParams({});
  }, [setParams]);

  const active = authorizationId === null ? 1 : verified === null ? 2 : preflight === null ? 3 : 4;
  const target =
    verified === null ? null : `${verified.method} ${verified.origin}${verified.routePath}`;

  return (
    <div className="relative z-20 mx-auto w-full max-w-3xl px-6 pb-32 pt-40">
      <header className="mb-14">
        <p className="mb-4 font-mono text-xs tracking-widest text-zinc-400">NEW RELEASE TEST</p>
        <h1 className="mb-6 font-manrope text-5xl font-medium leading-[1.1] tracking-tighter text-white md:text-6xl">
          Test an{" "}
          <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
            endpoint.
          </span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
          Authorize, preflight for free, then pay once. You always see the price before anything is
          signed.
        </p>
      </header>
      <div className="space-y-4">
        <StepCard
          index={1}
          total={total}
          title="Target"
          state={stateOf(1, active)}
          summary={target ?? authorizationId}
        >
          <AuthorizationForm idPrefix="test" onCreated={onCreated} />
        </StepCard>
        <StepCard
          index={2}
          total={total}
          title="Authorize"
          state={stateOf(2, active)}
          summary="Ownership verified"
        >
          {authorizationId === null ? null : (
            <AuthorizeStep
              authorizationId={authorizationId}
              challenge={challenge}
              onVerified={onVerified}
              onRestart={restart}
            />
          )}
        </StepCard>
        <StepCard
          index={3}
          total={total}
          title="Preflight"
          state={stateOf(3, active)}
          summary={preflight === null ? null : `Eligible · ${preflight.preflightId}`}
        >
          {verified === null ? null : (
            <PreflightStep authorization={verified} onEligible={setPreflight} />
          )}
        </StepCard>
        <StepCard index={4} total={total} title="Pay Selo" state={stateOf(4, active)}>
          {preflight === null ? null : <PayStep preflight={preflight} />}
        </StepCard>
        <StepCard index={5} total={total} title="Report" state="active">
          <ReportLinkStep />
        </StepCard>
      </div>
    </div>
  );
}
