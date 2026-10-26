import { ArrowDown, BadgeCheck, Terminal } from "lucide-react";
import { gateLinks, gateRuns } from "../../../lib/release-gate-facts";
import { GateRunCard } from "./gate-run-card";

const steps = [
  [
    "Run one command before you ship",
    "selo test pays Selo 1.00 USDC over x402 and names your release.",
  ],
  [
    "Selo becomes a real customer",
    "Only after its own payment settles does Selo pay your endpoint, on Algorand Mainnet.",
  ],
  [
    "Five checks, one gate",
    "Exit 0 ships. A FAIL or anything unproven blocks: in your terminal or in GitHub Actions.",
  ],
  [
    "Proof that travels",
    "Every verdict is signed. Anyone can verify it offline, and it can't unlock another release.",
  ],
] as const;

const command = [
  "pnpm selo test \\",
  "  --url https://staging.you.dev/v1/orders \\",
  "  --contract contract.json --release $GIT_SHA \\",
  "  --network mainnet --max-usdc 1.00",
] as const;

export function ReleaseGate() {
  const [broken, fixed] = gateRuns;
  return (
    <section
      id="release-gate"
      aria-labelledby="release-gate-title"
      className="relative z-20 mx-auto mb-24 mt-8 w-full max-w-7xl scroll-mt-28 px-4"
    >
      <div className="mb-16 flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1">
          <span className="flex size-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.6)]" />
          <span className="font-sans text-xs font-semibold uppercase tracking-widest text-orange-200">
            New · The release gate
          </span>
        </div>
        <h2
          id="release-gate-title"
          className="mb-6 max-w-4xl font-manrope text-5xl font-medium tracking-tighter text-white md:text-6xl"
        >
          Healthy is not the same as{" "}
          <span className="bg-gradient-to-r from-orange-300 to-orange-600 bg-clip-text text-transparent">
            working after payment.
          </span>
        </h2>
        <p className="max-w-3xl font-sans text-xl leading-relaxed text-gray-400">
          Our demo merchant passes every health check, settles every payment and answers 200, yet
          the receipt it sells is broken. Monitoring calls it fine. Selo pays for real, fails the
          release, and only lets the fix ship.
        </p>
      </div>

      <div className="edge edge-soft grid grid-cols-1 gap-6 rounded-[2.5rem] p-4 lg:grid-cols-12">
        <div className="flex flex-col gap-6 rounded-[2rem] bg-zinc-900/40 p-8 lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
              <Terminal aria-hidden="true" className="size-3.5 text-zinc-500" />
              <span className="font-mono text-[11px] text-zinc-500">your release pipeline</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-relaxed text-zinc-300 sm:text-[12.5px]">
              {command.map((line, index) => (
                <span key={line} className="block">
                  {index === 0 ? <span className="text-orange-400">$ </span> : null}
                  {line}
                </span>
              ))}
            </pre>
          </div>
          <ol className="space-y-5">
            {steps.map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-950 font-mono text-xs text-orange-300">
                  {String(index + 1)}
                </span>
                <div>
                  <p className="font-manrope text-base font-semibold text-white">{title}</p>
                  <p className="font-sans text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex flex-wrap gap-3">
            <a
              href={gateLinks.action}
              className="rounded-full bg-white px-5 py-2.5 font-sans text-sm font-semibold text-black transition-transform hover:scale-[1.03]"
            >
              Gate your CI
            </a>
            <a
              href={gateLinks.pilot}
              className="rounded-full border border-white/10 bg-zinc-900 px-5 py-2.5 font-sans text-sm font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
            >
              Try it on your endpoint
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-7">
          {broken === undefined ? null : <GateRunCard run={broken} />}
          <div className="flex items-center justify-center gap-3 py-1 font-sans text-xs font-medium uppercase tracking-widest text-zinc-500">
            <ArrowDown aria-hidden="true" className="size-3.5" />
            Fix shipped to the same URL
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </div>
          {fixed === undefined ? null : <GateRunCard run={fixed} />}
          <p className="flex items-center justify-center gap-2 pt-2 text-center font-sans text-xs text-zinc-500">
            <BadgeCheck aria-hidden="true" className="size-3.5 text-zinc-400" />
            Real runs on Algorand Mainnet, 26 October 2026. Every link opens the public record.
          </p>
        </div>
      </div>
    </section>
  );
}
