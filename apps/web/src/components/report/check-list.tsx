import type { CheckResult } from "@selo/core";
import { checkCopy } from "../../lib/checks";
import { StatusChip } from "../ui/status-chip";

export function CheckList({ checks }: { readonly checks: readonly CheckResult[] }) {
  if (checks.length === 0) {
    return <p className="text-sm text-zinc-400">No checks were recorded for this job.</p>;
  }
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.id}
          className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-zinc-950/50 p-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="font-mono text-[11px] text-orange-300">
                {checkCopy[check.id].code}
              </span>
              {checkCopy[check.id].name}
              {check.blocking ? null : (
                <span className="text-[10px] font-normal uppercase tracking-wider text-zinc-500">
                  non-blocking
                </span>
              )}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{check.summary}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">{check.code}</p>
          </div>
          <StatusChip status={check.status} size="md" />
        </li>
      ))}
    </ul>
  );
}
