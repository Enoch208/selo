import chatLike from "@iconify-icons/solar/chat-square-like-bold-duotone";
import starIcon from "@iconify-icons/solar/star-bold-duotone";
import { ArrowUpRight } from "lucide-react";
import { links } from "../../../lib/links";
import { SolarIcon } from "../../ui/solar-icon";

function EvidenceLink({
  href,
  label,
  dark,
}: {
  readonly href: string;
  readonly label: string;
  readonly dark: boolean;
}) {
  return (
    <a
      href={href}
      className={
        dark
          ? "inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
          : "inline-flex items-center gap-1 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-950"
      }
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </a>
  );
}

export function ListingCard() {
  return (
    <article className="edge edge-soft group relative flex flex-col justify-between rounded-[2.5rem] bg-zinc-900/40 p-8 backdrop-blur-xs transition-all duration-500 hover:bg-zinc-900/60">
      <div className="relative z-10">
        <SolarIcon icon={chatLike} className="mb-4 text-3xl text-zinc-600" />
        <h3 className="mb-6 font-sans text-sm leading-relaxed text-gray-300">
          Listed in Bazaar and on the{" "}
          <span className="font-mono text-white">x402-global-challenge</span> leaderboard, with the
          paid route attributed to the challenge.
        </h3>
      </div>
      <div className="relative z-10 mt-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        <EvidenceLink href={links.bazaarEvidence} label="Bazaar record" dark />
        <EvidenceLink href={links.leaderboardEvidence} label="Leaderboard row" dark />
      </div>
    </article>
  );
}

export function PilotCard() {
  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-100 p-8 shadow-2xl">
      <div className="relative z-10">
        <SolarIcon icon={starIcon} className="mb-4 text-3xl text-zinc-400" />
        <h3 className="mb-6 font-sans text-sm font-medium leading-relaxed text-zinc-800">
          First external endpoint tested: ORA Gate, with its owner&apos;s permission. Selo paid it
          as a real client on Mainnet.
        </h3>
      </div>
      <div className="relative z-10 mt-auto flex items-center justify-between border-t border-zinc-300 pt-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            data-image-slot="proof-pilot-mark"
            className="size-10 rounded-full border border-zinc-400 bg-gradient-to-br from-zinc-300 to-zinc-400"
          />
          <div>
            <p className="font-manrope text-sm font-semibold text-zinc-900">ORA Gate</p>
            <p className="font-sans text-xs text-zinc-600">External pilot, 2026-09-27</p>
          </div>
        </div>
        <EvidenceLink href={links.pilotEvidence} label="Summary" dark={false} />
      </div>
    </article>
  );
}
