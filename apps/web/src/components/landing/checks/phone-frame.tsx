import battery from "@iconify-icons/solar/battery-full-bold-duotone";
import type { ReactNode } from "react";
import { SolarIcon } from "../../ui/solar-icon";

export function PhoneFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="phone-shadow relative z-10 h-[660px] w-[330px] overflow-hidden rounded-[3.5rem] border border-zinc-800 bg-zinc-950 ring-1 ring-white/10">
      <div
        aria-hidden="true"
        className="group/island absolute left-1/2 top-3 z-50 flex h-[32px] w-[110px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-3 transition-all duration-500 hover:w-[140px] hover:shadow-[0_0_20px_rgba(0,0,0,0.8)]"
      >
        <span className="flex h-full items-center gap-2 opacity-0 transition-opacity delay-100 duration-300 group-hover/island:opacity-100">
          <span className="size-1 animate-pulse rounded-full bg-red-500/80 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
        </span>
        <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1.5">
          <span className="size-4 rounded-full border border-white/5 bg-zinc-900/80 backdrop-blur-md" />
        </span>
        <span className="ml-auto flex h-full items-center gap-2 opacity-0 transition-opacity delay-100 duration-300 group-hover/island:opacity-100">
          <span className="size-1 rounded-full bg-green-500/80 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
        </span>
      </div>
      <div
        aria-hidden="true"
        className="absolute left-0 top-4 z-40 flex w-full items-center justify-between px-8 text-[10px] font-semibold tracking-wide text-white/90"
      >
        <span>9:41</span>
        <SolarIcon icon={battery} />
      </div>
      <div className="relative z-10 flex h-full w-full flex-col bg-gradient-to-b from-zinc-900 to-black px-6 pt-16">
        {children}
      </div>
    </div>
  );
}
