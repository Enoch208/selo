import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export type StepState = "done" | "active" | "locked";

interface StepCardProps {
  readonly index: number;
  readonly total: number;
  readonly title: string;
  readonly state: StepState;
  readonly summary?: ReactNode;
  readonly children?: ReactNode;
}

export function StepCard({ index, total, title, state, summary, children }: StepCardProps) {
  const label = `${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  return (
    <section
      aria-labelledby={`step-${String(index)}`}
      aria-current={state === "active" ? "step" : undefined}
      className={cx(
        "edge rounded-[2rem] bg-gradient-to-br backdrop-blur-lg transition-opacity",
        state === "active"
          ? "from-white/10 to-white/0 p-8 md:p-10"
          : "from-white/5 to-white/0 px-8 py-6",
        state === "locked" && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={cx(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs",
              state === "done"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : state === "active"
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                  : "border-white/10 text-zinc-500",
            )}
          >
            {state === "done" ? <Check aria-label="Done" className="size-4" /> : String(index)}
          </span>
          <h2
            id={`step-${String(index)}`}
            className="truncate font-manrope text-xl font-semibold tracking-tight text-white md:text-2xl"
          >
            {title}
          </h2>
        </div>
        <span className="shrink-0 font-mono text-xs tracking-widest text-zinc-500">{label}</span>
      </div>
      {state === "done" && summary !== undefined ? (
        <div className="mt-3 pl-12 text-sm text-zinc-400">{summary}</div>
      ) : null}
      {state === "active" ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}
