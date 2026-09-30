import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface BeamLinkProps {
  readonly to: string;
  readonly children: ReactNode;
}

export function BeamLink({ to, children }: BeamLinkProps) {
  return (
    <Link
      to={to}
      className="group relative isolate flex items-center justify-center overflow-hidden rounded-full px-12 py-5 font-geist text-sm font-medium uppercase tracking-widest text-white transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(234,88,12,0.5)]"
    >
      <span aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden rounded-full p-px">
        <span className="beam absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0_300deg,#ea580c_360deg)]" />
        <span className="absolute inset-px rounded-full bg-black" />
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-[2px] -z-10 overflow-hidden rounded-full bg-zinc-950"
      >
        <span className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
        <span className="drift-dots absolute inset-0 opacity-30 mix-blend-overlay" />
        <span className="pointer-events-none absolute bottom-0 left-1/2 h-1/2 w-2/3 -translate-x-1/2 rounded-full bg-orange-500/10 blur-2xl transition-colors duration-500 group-hover:bg-orange-500/30" />
      </span>
      <span className="relative z-10 font-sans text-white/90 transition-colors group-hover:text-white">
        {children}
      </span>
      <ArrowRight
        aria-hidden="true"
        className="relative z-10 ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1"
      />
    </Link>
  );
}
