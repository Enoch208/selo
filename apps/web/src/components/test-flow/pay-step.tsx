import type { PreflightEligible } from "@selo/core";
import { CopyButton } from "../ui/copy-button";
import { installCommand, paySnippet } from "./pay-snippet";

function Price({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}) {
  return (
    <div className="edge edge-dim flex flex-1 flex-col rounded-2xl bg-gradient-to-br from-white/10 to-white/0 p-4">
      <dt className="mb-1 font-sans text-[10px] uppercase tracking-wider text-zinc-400">{label}</dt>
      <dd className="font-geist text-2xl font-semibold tracking-tight text-white">
        {value} <span className="text-sm font-normal text-zinc-400">USDC</span>
      </dd>
      <dd className="mt-1 text-xs text-zinc-400">{note}</dd>
    </div>
  );
}

function CodeBlock({ code, label }: { readonly code: string; readonly label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2">
        <span className="font-mono text-[11px] text-zinc-400">{label}</span>
        <CopyButton value={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function PayStep({ preflight }: { readonly preflight: PreflightEligible }) {
  const expires = new Date(preflight.expiresAt).toLocaleString();
  return (
    <div className="space-y-8">
      <dl className="flex flex-col gap-3 sm:flex-row">
        <Price
          label="You pay Selo"
          value={preflight.seloPriceUsdc}
          note="One release test, via x402"
        />
        <Price
          label="Selo pays your endpoint"
          value={preflight.target.priceUsdc}
          note="From Selo's wallet, reserved before signing"
        />
      </dl>
      <p className="text-sm leading-relaxed text-zinc-300">
        In-browser wallet payment is not built yet. Pay with your x402 client: the script below
        signs one {preflight.seloPriceUsdc} USDC payment on Algorand and refuses anything above
        that. Preflight <span className="font-mono text-white">{preflight.preflightId}</span> is
        valid until {expires}.
      </p>
      <CodeBlock label="Install" code={installCommand} />
      <CodeBlock
        label="pay-selo.ts · run with npx tsx pay-selo.ts"
        code={paySnippet(window.location.origin, preflight.preflightId, preflight.seloPriceUsdc)}
      />
      <p className="text-xs leading-relaxed text-zinc-400">
        Reusing the same idempotency key after a lost response returns the existing job instead of
        charging again. The response includes the verdict and a private report link.
      </p>
    </div>
  );
}
