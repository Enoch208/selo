import { Workflow } from "lucide-react";
import { links } from "../../../lib/links";
import { roundTrip } from "../../../lib/mainnet-facts";
import { TxLink } from "../../ui/tx-link";

const legs = [
  { label: "Selo was paid", leg: roundTrip.inbound },
  { label: "Selo paid the target", leg: roundTrip.downstream },
] as const;

export function RoundTripCard() {
  return (
    <article className="edge edge-soft group relative rounded-[2.5rem] bg-zinc-900/40 p-10 backdrop-blur-xs transition-all duration-500 hover:bg-zinc-900/60">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-bl from-blue-500/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative z-10">
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center">
          <p className="font-geist text-6xl font-semibold tracking-tighter text-white">
            2
            <span className="ml-1 mt-2 align-top text-xs font-normal tracking-tighter text-zinc-400">
              legs
            </span>
          </p>
          <h3 className="text-lg font-medium text-zinc-300">
            One release job, both payments on Algorand Mainnet, in order.
          </h3>
        </div>
        <ol className="mb-8 grid gap-3 sm:grid-cols-2">
          {legs.map(({ label, leg }, index) => (
            <li key={label} className="rounded-2xl border border-white/5 bg-zinc-950/50 p-4">
              <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                {String(index + 1)} · {label}
              </p>
              <p className="mb-2 font-geist text-sm text-white">
                {leg.amountUsdc} USDC · round {leg.round}
              </p>
              <TxLink txId={leg.txId} />
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-800">
              <Workflow aria-hidden="true" className="size-4 text-zinc-300" />
            </div>
            <div className="min-w-0">
              <p className="font-manrope text-sm font-semibold text-white">
                Orchestrator round trip
              </p>
              <p className="truncate font-mono text-xs text-zinc-400">{roundTrip.jobId}</p>
            </div>
          </div>
          <a
            href={links.roundTripEvidence}
            className="shrink-0 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-white"
          >
            Evidence
          </a>
        </div>
      </div>
    </article>
  );
}
