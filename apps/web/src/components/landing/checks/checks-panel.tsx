import boxIcon from "@iconify-icons/solar/box-minimalistic-bold-duotone";
import type { CheckStatus } from "@selo/core";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { checkCopy, checkOrder } from "../../../lib/checks";
import { links } from "../../../lib/links";
import { seloFacts } from "../../../lib/mainnet-facts";
import { SolarIcon } from "../../ui/solar-icon";
import { StatusChip } from "../../ui/status-chip";

const card =
  "edge edge-faint w-full max-w-sm rounded-3xl bg-gradient-to-br from-white/10 to-white/0 text-left backdrop-blur-xl transition-transform duration-500 hover:scale-[1.01]";
const stat =
  "edge edge-dim flex flex-1 flex-col rounded-2xl bg-gradient-to-br from-white/10 to-white/0 p-3 transition-colors hover:bg-white/10";
const statuses: readonly CheckStatus[] = ["PASS", "WARN", "FAIL", "INCONCLUSIVE"];

function GateCard() {
  const stats = [
    { label: "Checks", value: String(checkOrder.length) },
    { label: "Price", value: `${seloFacts.releaseTestPriceUsdc} USDC` },
    { label: "Cap", value: `${seloFacts.absoluteCapUsdc} USDC` },
  ];
  return (
    <div className={`${card} p-5 shadow-2xl`}>
      <div className="mb-6 flex items-center gap-4">
        <div className="size-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 p-0.5 shadow-lg shadow-orange-500/20">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-black">
            <SolarIcon icon={boxIcon} className="size-5 text-orange-500" />
          </div>
        </div>
        <div>
          <h3 className="font-manrope text-lg font-semibold tracking-tight text-white">
            Release gate
          </h3>
          <p className="font-sans text-xs font-medium text-zinc-400">Profile quick · GET or POST</p>
        </div>
        <span className="ml-auto size-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
      </div>
      <dl className="mb-5 flex justify-between gap-2">
        {stats.map((item) => (
          <div key={item.label} className={stat}>
            <dt className="mb-1 font-sans text-[10px] uppercase tracking-wider text-zinc-400">
              {item.label}
            </dt>
            <dd className="font-geist text-sm font-semibold text-white">{item.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        to="/test"
        className="edge edge-dim group flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white/10 to-white/0 py-2.5 text-xs font-medium text-white transition-colors duration-300 hover:bg-white/10"
      >
        Test an endpoint
        <ArrowRight
          aria-hidden="true"
          className="size-3 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}

function VerdictCard() {
  const docs = [
    { label: "API docs", href: links.apiDocs },
    { label: "Claims ledger", href: links.claims },
  ];
  return (
    <div className={`${card} p-5 shadow-xl`}>
      <p className="mb-4 font-sans text-sm leading-relaxed text-zinc-400">
        The verdict is a pure function of the checks. A blocking failure with evidence is FAIL;
        anything Selo could not establish is INCONCLUSIVE.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((status) => (
          <StatusChip key={status} status={status} />
        ))}
      </div>
      <div className="flex gap-2">
        {docs.map((doc) => (
          <a
            key={doc.label}
            href={doc.href}
            className="group flex flex-1 items-center justify-between rounded-xl border border-white/5 bg-zinc-950/50 px-3 py-2 transition-colors hover:border-white/20"
          >
            <span className="font-sans text-xs font-medium text-zinc-300">{doc.label}</span>
            <ArrowUpRight
              aria-hidden="true"
              className="size-3 text-zinc-500 transition-colors group-hover:text-white"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

function ProvesCard() {
  return (
    <div className={`${card} p-4 shadow-xl`}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-sans text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          What each check proves
        </h3>
        <span className="size-1.5 animate-ping rounded-full bg-orange-500" />
      </div>
      <ul className="space-y-2">
        {checkOrder.map((id) => (
          <li
            key={id}
            className="flex items-start gap-3 rounded-xl border border-white/5 bg-zinc-950/50 p-2.5 transition-colors hover:border-white/10 hover:bg-white/[0.02]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 font-mono text-[10px] font-semibold text-orange-300">
              {checkCopy[id].code}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-geist text-xs font-medium text-zinc-200">
                {checkCopy[id].name}
              </span>
              <span className="text-[11px] leading-snug text-zinc-400">{checkCopy[id].proves}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChecksPanel() {
  return (
    <div className="relative z-10 order-3 flex flex-col justify-center gap-5 lg:col-span-4 lg:items-end">
      <GateCard />
      <VerdictCard />
      <ProvesCard />
    </div>
  );
}
