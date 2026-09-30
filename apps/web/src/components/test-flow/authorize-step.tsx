import type { AuthorizationChallengeView, AuthorizationView } from "@selo/core";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getJson, postJson, type ApiFailure } from "../../lib/api";
import { authorizationSchema } from "../../lib/wire";
import { ChallengeCard } from "../authorize/challenge-card";
import { FailureNotice } from "../ui/failure-notice";
import { PrimaryButton } from "../ui/primary-button";

interface AuthorizeStepProps {
  readonly authorizationId: string;
  readonly challenge: AuthorizationChallengeView | null;
  readonly onVerified: (authorization: AuthorizationView) => void;
  readonly onRestart: () => void;
}

function authorizationPath(id: string): string {
  return `/v1/authorizations/${encodeURIComponent(id)}`;
}

export function AuthorizeStep({
  authorizationId,
  challenge,
  onVerified,
  onRestart,
}: AuthorizeStepProps) {
  const [current, setCurrent] = useState<AuthorizationView | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    void getJson(authorizationPath(authorizationId), authorizationSchema).then((result) => {
      if (!live) {
        return;
      }
      if (!result.ok) {
        setFailure(result.failure);
        return;
      }
      setCurrent(result.data);
      if (result.data.status === "VERIFIED") {
        onVerified(result.data);
      }
    });
    return () => {
      live = false;
    };
  }, [authorizationId, onVerified]);

  async function verify(): Promise<void> {
    setPending(true);
    setFailure(null);
    const result = await postJson(
      `${authorizationPath(authorizationId)}/verify`,
      undefined,
      authorizationSchema,
    );
    setPending(false);
    if (result.ok) {
      setCurrent(result.data);
      onVerified(result.data);
    } else {
      setFailure(result.failure);
    }
  }

  const closed = current !== null && (current.status === "EXPIRED" || current.status === "REVOKED");
  return (
    <div className="space-y-8">
      {challenge === null ? (
        <p className="text-sm leading-relaxed text-zinc-300">
          Serve the <span className="font-mono text-white">selo-verification=</span> line you were
          given at{" "}
          <span className="font-mono text-white">
            {current === null ? "your origin" : current.origin}/.well-known/selo-verification.txt
          </span>
          , then check it. The token itself is only shown once, when the challenge is created.
        </p>
      ) : (
        <ChallengeCard challenge={challenge} />
      )}
      {current === null ? null : (
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {current.method} {current.origin}
          {current.routePath} · status{" "}
          <span className="font-mono text-zinc-200">{current.status}</span>
        </p>
      )}
      {failure === null ? null : <FailureNotice failure={failure} />}
      <div className="flex flex-wrap items-center justify-end gap-6">
        <button
          type="button"
          onClick={onRestart}
          className="text-xs uppercase tracking-wider text-zinc-400 transition-colors hover:text-white"
        >
          New challenge
        </button>
        {closed ? null : (
          <PrimaryButton
            pending={pending}
            onClick={() => {
              void verify();
            }}
          >
            {pending ? "Checking…" : "Check verification"}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
