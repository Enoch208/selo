import type { CheckStatus } from "@selo/core";
import {
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cx } from "../../lib/cx";

interface ChipStyle {
  readonly icon: LucideIcon;
  readonly className: string;
}

const styles: Readonly<Record<CheckStatus, ChipStyle>> = {
  PASS: {
    icon: CircleCheck,
    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  },
  WARN: { icon: TriangleAlert, className: "text-amber-300 bg-amber-500/10 border-amber-500/25" },
  FAIL: { icon: CircleX, className: "text-red-400 bg-red-500/10 border-red-500/30" },
  INCONCLUSIVE: {
    icon: CircleQuestionMark,
    className: "text-sky-300 bg-sky-500/10 border-sky-500/25",
  },
};

interface StatusChipProps {
  readonly status: CheckStatus;
  readonly size?: "sm" | "md";
}

export function StatusChip({ status, size = "sm" }: StatusChipProps) {
  const { icon: StatusIcon, className } = styles[status];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold tracking-wide",
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <StatusIcon aria-hidden="true" className={size === "sm" ? "size-2.5" : "size-3.5"} />
      {status}
    </span>
  );
}
