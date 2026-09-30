import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface SpinBorderLinkProps {
  readonly to: string;
  readonly children: ReactNode;
}

export function SpinBorderLink({ to, children }: SpinBorderLinkProps) {
  return (
    <Link
      to={to}
      className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-px transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(255,255,255,0.1)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_75%,#ffffff_100%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-zinc-800 transition-opacity duration-300 group-hover:opacity-0"
      />
      <span className="relative flex h-full w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-950 px-6 py-2.5 text-xs font-medium uppercase tracking-widest text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-colors duration-300 group-hover:text-white">
        <span className="relative z-10">{children}</span>
        <ArrowRight
          aria-hidden="true"
          className="relative z-10 size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
