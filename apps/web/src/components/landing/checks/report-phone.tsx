import { ArrowLeft, ChevronRight, Ellipsis } from "lucide-react";
import { checkCopy } from "../../../lib/checks";
import { cx } from "../../../lib/cx";
import { StatusChip } from "../../ui/status-chip";
import { exampleChecks } from "./example-report";
import { PhoneFrame } from "./phone-frame";
import { PaymentFlow } from "./payment-flow";

const roundButton =
  "edge edge-dim flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/0 text-white/70 backdrop-blur-xs";

export function ReportPhone() {
  return (
    <PhoneFrame>
      <div className="relative z-10 mb-6 flex items-center justify-between">
        <span aria-hidden="true" className={roundButton}>
          <ArrowLeft className="size-4" />
        </span>
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
          <span className="text-sm font-semibold tracking-wide text-white">Example report</span>
        </div>
        <span aria-hidden="true" className={roundButton}>
          <Ellipsis className="size-4" />
        </span>
      </div>
      <div className="mb-4 text-center">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Release verdict
        </p>
        <p className="font-geist text-5xl font-medium tracking-tighter text-white">FAIL</p>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="rounded-sm border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            1 blocking failure
          </span>
          <span className="text-xs font-medium text-zinc-400">release held</span>
        </div>
      </div>
      <PaymentFlow />
      <div className="-mx-6 flex-1 rounded-t-[2rem] border-t border-white/5 bg-zinc-900/60 px-6 pb-4 pt-5 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Checks</p>
          <span aria-hidden="true" className="flex gap-1">
            <span className="size-1 rounded-full bg-zinc-600" />
            <span className="size-1 rounded-full bg-zinc-700" />
          </span>
        </div>
        <ul className="space-y-1.5">
          {exampleChecks.map((check) => (
            <li
              key={check.id}
              className={cx(
                "group flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]",
                check.status === "FAIL"
                  ? "edge edge-dim bg-gradient-to-br from-white/10 to-white/0"
                  : "border border-white/5 bg-white/[0.02]",
              )}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-white">
                  {checkCopy[check.id].name}
                </span>
                <span className="truncate text-[10px] font-medium text-zinc-400">{check.note}</span>
              </div>
              <span className="flex items-center gap-1">
                <StatusChip status={check.status} />
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 text-zinc-600 transition-colors group-hover:text-white"
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PhoneFrame>
  );
}
