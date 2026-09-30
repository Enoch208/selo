import folderPath from "@iconify-icons/solar/folder-path-connect-bold-duotone";
import { seloFacts } from "../../../lib/mainnet-facts";
import { SolarIcon } from "../../ui/solar-icon";

function FloatingWidgets() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-radial from-white/[0.07] via-transparent to-transparent opacity-50">
      <div className="dot-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(circle_at_center,black_40%,transparent_100%)]" />
      <div className="absolute left-10 top-10 w-32 -rotate-6 rounded-xl border border-white/10 bg-zinc-900/60 p-3 shadow-xl backdrop-blur-xs transition-transform duration-500 hover:scale-105">
        <div className="mb-3 flex items-center gap-2">
          <span className="size-2 rounded-full bg-white/20" />
          <span className="h-1 w-12 rounded-full bg-white/20" />
        </div>
        <div className="space-y-2">
          {["w-16", "w-10", "w-14"].map((width) => (
            <div key={width} className="flex items-center gap-2">
              <span className="size-2.5 rounded-[3px] border border-white/20" />
              <span className={`h-1 ${width} rounded-full bg-white/10`} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute right-12 top-8 flex h-10 w-20 rotate-12 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 shadow-lg backdrop-blur-xs transition-transform duration-500 hover:scale-105">
        <span className="font-mono text-[10px] font-medium tracking-wider text-orange-200/70">
          {seloFacts.authorizationHours}h TTL
        </span>
      </div>
      <div className="absolute bottom-8 right-10 w-24 rotate-3 rounded-xl border border-white/10 bg-zinc-900/60 p-2.5 shadow-xl backdrop-blur-xs transition-transform duration-500 hover:scale-105">
        <div className="mb-2 flex justify-between">
          <span className="h-1 w-8 rounded-full bg-white/20" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <span className="aspect-square rounded-[4px] border border-white/5 bg-white/10" />
          <span className="aspect-square rounded-[4px] border border-white/5 bg-white/5" />
          <span className="aspect-square rounded-[4px] border border-white/5 bg-white/10" />
        </div>
      </div>
      <div className="absolute bottom-6 left-12 size-14 -rotate-3 rounded-lg border border-dashed border-white/10 opacity-30" />
    </div>
  );
}

function VerificationFile() {
  return (
    <div className="relative z-10 transition-transform duration-500 ease-out group-hover:scale-105">
      <div className="relative h-24 w-28">
        <div className="absolute bottom-0 h-20 w-full rounded-xl border border-white/10 bg-zinc-800 shadow-2xl" />
        <div className="absolute bottom-4 left-3 right-3 h-20 origin-bottom-left -rotate-3 rounded-lg border border-white/5 bg-zinc-700 shadow-md">
          <span className="absolute left-3 top-3 h-1.5 w-1/2 rounded-full bg-zinc-600" />
          <span className="absolute left-3 top-6 h-1.5 w-3/4 rounded-full bg-zinc-600" />
        </div>
        <div className="absolute bottom-0 h-14 w-full overflow-hidden rounded-b-xl border-x border-b border-white/10 bg-gradient-to-b from-zinc-800/50 to-zinc-800 backdrop-blur-[2px]">
          <span className="absolute -top-8 left-1/2 size-6 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-zinc-800" />
        </div>
        <div className="absolute -bottom-3 -right-3 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 shadow-lg shadow-black/50">
          <span className="font-manrope text-base font-bold tracking-tighter text-orange-500">
            S
          </span>
        </div>
      </div>
    </div>
  );
}

export function PermissionCard() {
  return (
    <article className="edge group flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-lg transition-colors duration-500">
      <div
        aria-hidden="true"
        className="fade-bottom-90 relative flex h-64 items-center justify-center overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent"
      >
        <FloatingWidgets />
        <VerificationFile />
      </div>
      <div className="mt-auto px-10 pb-10 pt-8">
        <div className="mb-5 flex items-center gap-3">
          <SolarIcon icon={folderPath} className="size-6 text-white" />
          <h3 className="font-manrope text-xl font-semibold tracking-tight text-white">
            Permissioned
          </h3>
        </div>
        <p className="mb-8 font-sans text-base leading-relaxed text-gray-400">
          The owner authorizes the exact route first, by serving a one-time token or through a
          recorded consent. Selo tests only authorized routes, and re-checks the authorization
          before every paid request.
        </p>
        <a
          href="#test"
          className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-mono text-sm font-medium text-orange-400 transition-colors hover:border-orange-400/50 hover:text-white"
        >
          /.well-known/selo-verification.txt
        </a>
      </div>
    </article>
  );
}
