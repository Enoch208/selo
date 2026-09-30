import { links } from "../../../lib/links";
import { roundTrip, seloFacts } from "../../../lib/mainnet-facts";
import { TxLink } from "../../ui/tx-link";

interface Slide {
  readonly figure: string;
  readonly unitClass: string;
  readonly borderClass: string;
  readonly unit: string;
  readonly statement: string;
  readonly detail: string;
  readonly glow: string;
  readonly txId: string | null;
}

const slides: readonly Slide[] = [
  {
    figure: roundTrip.inbound.amountUsdc,
    unit: "USDC",
    unitClass: "text-orange-500",
    borderClass: "border-orange-500",
    glow: "from-orange-500/5",
    statement: `Paid to Selo's own x402 endpoint, settled in round ${String(roundTrip.inbound.round)}.`,
    detail:
      "The go-live release test, funded by Selo's owner. Only after it settled did Selo spend anything.",
    txId: roundTrip.inbound.txId,
  },
  {
    figure: roundTrip.downstream.amountUsdc,
    unit: "USDC",
    unitClass: "text-blue-500",
    borderClass: "border-blue-500",
    glow: "from-blue-500/5",
    statement: `Paid by Selo to ${roundTrip.target} as a real x402 client, round ${String(roundTrip.downstream.round)}.`,
    detail: "The downstream leg of the same job, signed for exactly the reserved requirement.",
    txId: roundTrip.downstream.txId,
  },
  {
    figure: seloFacts.absoluteCapUsdc,
    unit: "USDC",
    unitClass: "text-red-500",
    borderClass: "border-red-500",
    glow: "from-red-500/5",
    statement: "Hard cap on what one release job can ever spend downstream.",
    detail:
      "Reservations are a single conditional database update, proven by parallel tests against real PostgreSQL.",
    txId: null,
  },
];

export function ProofCarousel() {
  return (
    <div className="carousel relative lg:col-span-5">
      {slides.map((slide) => (
        <article
          key={slide.statement}
          className="edge edge-soft group relative flex flex-col justify-between rounded-[2.5rem] bg-zinc-900/40 p-10 backdrop-blur-xs transition-all duration-500 hover:bg-zinc-900/60"
        >
          <div
            aria-hidden="true"
            className={`absolute inset-0 rounded-[2.5rem] bg-gradient-to-br ${slide.glow} via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
          />
          <div className="relative z-10">
            <p className="mb-4 font-geist text-7xl font-semibold tracking-tighter text-white sm:text-8xl">
              {slide.figure}
              <span className={`ml-2 align-top text-2xl ${slide.unitClass}`}>{slide.unit}</span>
            </p>
            <h3
              className={`mb-12 border-l-2 pl-4 text-xl font-medium text-zinc-300 ${slide.borderClass}`}
            >
              {slide.statement}
            </h3>
            <p className="mb-8 font-sans text-lg leading-relaxed text-gray-300">{slide.detail}</p>
          </div>
          <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/5 pt-8">
            {slide.txId === null ? (
              <a
                href={links.claims}
                className="text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-white"
              >
                Spend-cap tests in the claims ledger
              </a>
            ) : (
              <TxLink txId={slide.txId} />
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {slide.txId === null ? "Test suite" : "Mainnet"}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
