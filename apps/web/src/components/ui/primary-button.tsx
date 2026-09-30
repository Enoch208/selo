import type { ReactNode } from "react";

export const primaryButtonClass =
  "group inline-flex items-center gap-3 bg-white px-8 py-4 font-manrope text-xs font-semibold uppercase tracking-widest text-black transition-all duration-300 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60";

interface PrimaryButtonProps {
  readonly children: ReactNode;
  readonly pending?: boolean;
  readonly onClick?: () => void;
  readonly type?: "button" | "submit";
}

export function PrimaryButton({
  children,
  pending = false,
  onClick,
  type = "button",
}: PrimaryButtonProps) {
  return (
    <button type={type} disabled={pending} onClick={onClick} className={primaryButtonClass}>
      {children}
    </button>
  );
}
