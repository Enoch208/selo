import { ArrowUpRight, GitBranch, ShieldCheck, ShieldX } from "lucide-react";
import { cx } from "../../../lib/cx";
import type { GateRun } from "../../../lib/release-gate-facts";
import { TxLink } from "../../ui/tx-link";

const tones = {
  BLOCK: {
    ring: "border-red-500/25",
    glow: "from-red-500/10",
    chip: "border-red-500/30 bg-red-500/10 text-red-300",
    text: "text-red-300",
    Icon: ShieldX,
  },
  ALLOW: {
    ring: "border-emerald-500/25",
    glow: "from-emerald-500/10",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    text: "text-emerald-300",
    Icon: ShieldCheck,
  },
} as const;

export function GateRunCard({ run }: { readonly run: GateRun }) {
  const tone = tones[run.gate];
  const { Icon } = tone;
  return (
    <article
      className={cx(
        "relative overflow-hidden rounded-[2rem] border bg-zinc-900/50 p-7 backdrop-blur-xs",
        tone.ring,
      )}
    >
      <div
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent",
          tone.glow,
        )}
      />
      <div className="relative z-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/60">
              <Icon aria-hidden="true" className={cx("size-5", tone.text)} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-sm text-white">{run.release}</p>
              <p className="truncate font-mono text-[11px] text-zinc-500">{run.jobId}</p>
            </div>
          </div>
          <span
            className={cx(
              "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-xs font-semibold tracking-wider",
              tone.chip,
            )}
          >
            {run.verdict} · exit {String(run.exitCode)}
          </span>
        </div>
        <p className={cx("mb-1 font-mono text-sm", tone.text)}>{run.finding}</p>
        <p className="mb-6 font-sans text-sm leading-relaxed text-zinc-400">{run.detail}</p>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-zinc-950/50 p-3">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              1 · Selo was paid · 1.00 USDC
            </p>
            <TxLink txId={run.inbound.txId} />
          </div>
          <div className="rounded-2xl border border-white/5 bg-zinc-950/50 p-3">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              2 · Selo paid the merchant · 0.01
            </p>
            <TxLink txId={run.downstream.txId} />
          </div>
        </div>
        <a
          href={run.githubRun}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2 font-sans text-sm text-zinc-300 transition-colors hover:text-white"
        >
          <GitBranch aria-hidden="true" className="size-4 text-zinc-500" />
          GitHub Actions: <span className={tone.text}>{run.githubOutcome}</span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </a>
      </div>
    </article>
  );
}
