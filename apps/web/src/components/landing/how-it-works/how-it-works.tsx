import carousel from "@iconify-icons/solar/posts-carousel-horizontal-bold-duotone";
import { SolarIcon } from "../../ui/solar-icon";
import { CodePanel } from "./code-panel";
import { HealthCard } from "./health-card";
import { PermissionCard } from "./permission-card";
import { SpendCard } from "./spend-card";
import { useHealth } from "./use-health";

export function HowItWorks() {
  const health = useHealth();
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="relative z-20 mx-auto my-24 w-full max-w-7xl scroll-mt-28 px-2 pb-32 pt-10"
    >
      <div className="edge group relative z-10 mb-6 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/0 backdrop-blur-lg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-1/2 w-full bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent opacity-40"
        />
        <div className="grid lg:grid-cols-2">
          <div className="relative z-10 flex flex-col justify-center p-8 md:p-16">
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5">
              <SolarIcon icon={carousel} className="size-6 text-white" />
            </div>
            <h2
              id="how-title"
              className="mb-6 mt-6 font-manrope text-3xl font-semibold leading-[1.1] tracking-tight text-white md:text-4xl"
            >
              One real payment. A deterministic verdict.
            </h2>
            <div className="space-y-6 font-sans text-lg leading-relaxed text-gray-400">
              <p>
                Authorize the route you own, run a free preflight, then pay Selo through x402. Only
                after that payment has settled does Selo pay your endpoint, as a real client, from
                its own wallet.
              </p>
              <p>
                Five checks run against the live paid flow: handshake, paid delivery, response
                contract, discovery contract and retry / replay. Both payment legs are recorded with
                their Algorand transaction ids.
              </p>
              <p>
                The result is PASS, FAIL or INCONCLUSIVE, decided by deterministic code and backed
                by evidence. Anything Selo could not establish is INCONCLUSIVE: unknown is never
                PASS.
              </p>
            </div>
          </div>
          <div className="relative min-h-[500px] overflow-hidden border-l border-white/5 bg-zinc-950/30 font-geist">
            <CodePanel origin={window.location.origin} />
            <HealthCard health={health} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PermissionCard />
        <SpendCard />
      </div>
    </section>
  );
}
