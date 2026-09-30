import walletMoney from "@iconify-icons/solar/wallet-money-bold-duotone";
import { Coins, Lock, ShieldCheck } from "lucide-react";
import { links } from "../../../lib/links";
import { seloFacts } from "../../../lib/mainnet-facts";
import { SolarIcon } from "../../ui/solar-icon";

function Orbit() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute flex size-[260px] items-center justify-center rounded-full border border-dashed border-white/5 opacity-60">
        <div className="absolute -top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-2 py-0.5 shadow-lg">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-[9px] tracking-tight text-zinc-400">
            cap {seloFacts.absoluteCapUsdc}
          </span>
        </div>
      </div>
      <div className="absolute size-40 rounded-full border border-dashed border-white/10" />
      <div className="relative z-20 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-500 hover:scale-105 hover:shadow-[0_0_50px_-10px_rgba(255,255,255,0.1)]">
        <ShieldCheck className="size-8 text-white/90" strokeWidth={1.5} />
      </div>
      <div className="absolute right-[28%] top-[25%] z-10 transition-all duration-300 hover:scale-110">
        <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/90 shadow-lg shadow-purple-500/10 ring-1 ring-white/5 backdrop-blur-sm">
          <Coins className="size-4 text-purple-400" strokeWidth={1.5} />
        </div>
      </div>
      <div className="absolute bottom-[28%] left-[30%] z-10 transition-all duration-300 hover:scale-110">
        <div className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900/90 shadow-lg shadow-emerald-500/10 ring-1 ring-white/5 backdrop-blur-sm">
          <Lock className="size-3.5 text-emerald-400" strokeWidth={1.5} />
        </div>
      </div>
      <span className="absolute left-[45%] top-[20%] size-2 rounded-full border border-white/10 bg-zinc-700" />
      <span className="absolute bottom-[20%] right-[42%] size-1.5 rounded-full border border-white/10 bg-zinc-700" />
    </div>
  );
}

export function SpendCard() {
  return (
    <article className="edge group flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-lg transition-colors duration-500">
      <div
        aria-hidden="true"
        className="fade-bottom-85 relative flex h-64 items-center justify-center overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_70%)]" />
        <Orbit />
      </div>
      <div className="mt-auto px-10 pb-10 pt-8">
        <div className="mb-5 flex items-center gap-3">
          <SolarIcon icon={walletMoney} className="size-6 text-white" />
          <h3 className="font-manrope text-xl font-semibold tracking-tight text-white">
            Bounded spend
          </h3>
        </div>
        <p className="mb-8 font-sans text-base leading-relaxed text-gray-400">
          Every downstream payment is reserved against the job budget before it is signed, with a
          hard cap of{" "}
          <span className="font-medium text-white">{seloFacts.absoluteCapUsdc} USDC</span> per job.
        </p>
        <p className="font-sans text-sm leading-relaxed text-gray-400">
          If Selo cannot tell whether a payment landed, the amount is held as unresolved and
          spending stops. Every claim is tracked in the{" "}
          <a
            href={links.claims}
            className="text-emerald-400/80 underline decoration-emerald-500/30 underline-offset-2 transition-colors hover:text-emerald-300 hover:decoration-emerald-500"
          >
            claims ledger
          </a>
          .
        </p>
      </div>
    </article>
  );
}
