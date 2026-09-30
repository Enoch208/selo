import { ArrowRight } from "lucide-react";
import { BeamLink } from "../../ui/beam-link";
import { BuiltOn } from "./built-on";
import { HeroCurtain } from "./hero-curtain";
import { HeroHeadline } from "./hero-headline";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="fade-bottom-95 relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden pt-32 md:pt-20"
    >
      <HeroCurtain />
      <div className="relative z-10 mx-auto my-24 max-w-5xl px-6 text-center">
        <div className="enter edge edge-pill group mb-10 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-white/10 to-white/0 px-3 py-1.5 backdrop-blur-xs transition-transform [animation-delay:0.8s] hover:scale-105">
          <span className="flex size-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] group-hover:animate-pulse" />
          <span className="font-sans text-xs font-medium tracking-wide text-orange-100/80 transition-colors group-hover:text-white">
            Live on Algorand Mainnet
          </span>
        </div>
        <HeroHeadline />
        <p className="enter mx-auto mb-12 max-w-3xl font-manrope text-xl font-medium leading-relaxed tracking-normal text-gray-400 [animation-delay:1.2s] md:text-2xl">
          Selo makes a controlled real payment against your authorized x402 endpoint and returns an
          evidence-backed release verdict before your users hit it.
        </p>
        <div className="enter mb-12 flex flex-col items-center justify-center gap-6 [animation-delay:1.4s] md:flex-row">
          <BeamLink to="/test">Test an endpoint</BeamLink>
        </div>
        <div className="enter mb-20 mt-32 flex flex-col items-center gap-4 [animation-delay:1.6s]">
          <p className="font-sans text-xs font-medium uppercase tracking-widest text-gray-400">
            Built on
          </p>
          <a
            href="#proof"
            className="group inline-flex items-center gap-1 border-b border-transparent pb-0.5 font-sans text-sm text-gray-400 transition-all hover:border-white hover:text-white"
          >
            Read the proof
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 transition-transform group-hover:translate-x-1"
            />
          </a>
        </div>
      </div>
      <BuiltOn />
    </section>
  );
}
