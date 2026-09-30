import verified from "@iconify-icons/solar/verified-check-bold-duotone";
import arrowUpRight from "@iconify-icons/solar/arrow-right-up-linear";
import { links } from "../../../lib/links";
import { SolarIcon } from "../../ui/solar-icon";
import { ListingCard, PilotCard } from "./listing-cards";
import { ProofCarousel } from "./proof-carousel";
import { RoundTripCard } from "./round-trip-card";

export function Proof() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="relative z-20 mx-auto mb-32 mt-0 w-full max-w-7xl scroll-mt-28 p-6"
    >
      <div className="mb-20 flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1">
          <SolarIcon icon={verified} className="text-orange-500" />
          <span className="font-sans text-xs font-semibold uppercase tracking-widest text-orange-200">
            On-chain proof
          </span>
        </div>
        <h2
          id="proof-title"
          className="mb-6 font-manrope text-5xl font-medium tracking-tighter text-white md:text-7xl"
        >
          Proof,{" "}
          <span className="bg-gradient-to-r from-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            not promises.
          </span>
        </h2>
        <p className="max-w-2xl font-sans text-xl leading-relaxed text-gray-400">
          Every fact below links to a public Algorand explorer or to a sanitized evidence file. No
          testimonials, no invented numbers.
        </p>
      </div>
      <div className="edge edge-soft mb-12 grid grid-cols-1 gap-6 p-4 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <RoundTripCard />
          <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
            <ListingCard />
            <PilotCard />
          </div>
        </div>
        <ProofCarousel />
      </div>
      <div className="flex flex-col items-center justify-between gap-6 px-4 md:flex-row">
        <p className="font-sans text-xs font-medium text-zinc-400">
          Claims are marked PROVEN only when a real run backs them.
        </p>
        <a
          href={links.claims}
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 py-2 pl-6 pr-2 transition-all duration-300 hover:border-white/20 hover:bg-zinc-800"
        >
          <span className="font-sans text-sm font-medium text-zinc-300 group-hover:text-white">
            Read the claims ledger
          </span>
          <span className="flex size-8 items-center justify-center rounded-full bg-white text-black transition-transform group-hover:rotate-45">
            <SolarIcon icon={arrowUpRight} />
          </span>
        </a>
      </div>
    </section>
  );
}
