import type { AuthorizationChallengeView } from "@selo/core";
import { CopyButton } from "../ui/copy-button";

function Value({
  label,
  value,
  copyLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly copyLabel: string;
}) {
  return (
    <div>
      <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        {label}
      </p>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3">
        <code className="min-w-0 break-all font-mono text-xs leading-relaxed text-zinc-100">
          {value}
        </code>
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

export function ChallengeCard({ challenge }: { readonly challenge: AuthorizationChallengeView }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-zinc-300">
        Serve this line as plain text at the verification URL on{" "}
        <span className="font-mono text-white">{challenge.origin}</span>. It authorizes{" "}
        <span className="font-mono text-white">
          {challenge.method} {challenge.routePath}
        </span>{" "}
        only. The challenge expires one hour after it was issued.
      </p>
      <Value label="Verification URL" value={challenge.verificationUrl} copyLabel="Copy URL" />
      <Value label="File contents" value={challenge.expectedContent} copyLabel="Copy line" />
      <p className="font-mono text-[11px] text-zinc-500">
        Authorization {challenge.authorizationId}
      </p>
    </div>
  );
}
