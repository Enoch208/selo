import type { Verdict } from "@selo/core";
import {
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { cx } from "../../lib/cx";

interface VerdictStyle {
  readonly icon: LucideIcon;
  readonly tone: string;
  readonly glow: string;
  readonly meaning: string;
}

const styles: Readonly<Record<Verdict, VerdictStyle>> = {
  PASS: {
    icon: CircleCheck,
    tone: "text-emerald-400",
    glow: "bg-emerald-500/20",
    meaning: "Every blocking check passed with evidence.",
  },
  FAIL: {
    icon: CircleX,
    tone: "text-red-400",
    glow: "bg-red-500/20",
    meaning: "At least one blocking check failed, backed by evidence. Hold the release.",
  },
  INCONCLUSIVE: {
    icon: CircleQuestionMark,
    tone: "text-sky-300",
    glow: "bg-sky-500/20",
    meaning: "Selo could not establish every blocking check. Unknown is never PASS.",
  },
};

export function VerdictBanner({ verdict }: { readonly verdict: Verdict | null }) {
  if (verdict === null) {
    return (
      <div className="flex items-center gap-4">
        <LoaderCircle aria-hidden="true" className="size-10 animate-spin text-zinc-400" />
        <p className="font-geist text-5xl font-medium tracking-tighter text-white">Running</p>
      </div>
    );
  }
  const style = styles[verdict];
  const VerdictIcon = style.icon;
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={cx("absolute -left-10 -top-10 size-48 rounded-full blur-[80px]", style.glow)}
      />
      <p className="relative mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Verdict
      </p>
      <p
        className={cx(
          "relative flex items-center gap-4 font-geist text-6xl font-semibold tracking-tighter md:text-8xl",
          style.tone,
        )}
      >
        <VerdictIcon aria-hidden="true" className="size-12 md:size-16" strokeWidth={1.5} />
        {verdict}
      </p>
      <p className="relative mt-4 max-w-xl text-base text-zinc-300">{style.meaning}</p>
    </div>
  );
}
