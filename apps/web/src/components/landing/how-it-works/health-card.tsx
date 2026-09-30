import { Activity, Coins, LoaderCircle, Network, Server } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import { seloFacts } from "../../../lib/mainnet-facts";
import type { Health } from "./use-health";

function statusLine(health: Health): { readonly text: string; readonly tone: string } {
  if (health.state === "up") {
    return { text: "Operational", tone: "text-emerald-500" };
  }
  if (health.state === "down") {
    return { text: "Unreachable from your browser", tone: "text-red-400" };
  }
  return { text: "Checking…", tone: "text-zinc-400" };
}

function LatencyBars({ roundTripMs }: { readonly roundTripMs: number }) {
  const lit = roundTripMs < 300 ? 3 : roundTripMs < 900 ? 2 : 1;
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className={cx("h-3 w-1 rounded-full", bar < lit ? "bg-emerald-500" : "bg-emerald-500/20")}
        />
      ))}
    </span>
  );
}

function Row({
  icon,
  title,
  caption,
  aside,
  delay,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly caption: ReactNode;
  readonly aside: ReactNode;
  readonly delay: string;
}) {
  return (
    <li
      className={cx(
        "enter-row flex items-center justify-between gap-3 p-3.5 transition-colors hover:bg-white/5",
        delay,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="flex min-w-0 flex-col">
          <span className="font-normal text-gray-200">{title}</span>
          <span className="mt-0.5 truncate text-xs font-normal text-gray-400">{caption}</span>
        </div>
      </div>
      {aside}
    </li>
  );
}

const iconBox = "flex size-8 shrink-0 items-center justify-center rounded-lg";

export function HealthCard({ health }: { readonly health: Health }) {
  const status = statusLine(health);
  return (
    <div className="in-view-gate absolute left-1/2 top-1/2 z-10 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 p-6">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/90 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-700 ease-out group-hover:scale-[1.02]">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] p-5">
          <div>
            <h3 className="font-sans text-sm font-normal tracking-wide text-white">
              Selo API status
            </h3>
            <div className="mt-1 flex items-center gap-2" aria-live="polite">
              <span className="relative flex size-2 shrink-0">
                {health.state === "up" ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                ) : null}
                <span
                  className={cx(
                    "relative inline-flex size-2 rounded-full",
                    health.state === "up"
                      ? "bg-emerald-500"
                      : health.state === "down"
                        ? "bg-red-500"
                        : "bg-zinc-500",
                  )}
                />
              </span>
              <p
                key={status.text}
                className={cx("type-writer text-xs font-normal tracking-wide", status.tone)}
              >
                {status.text}
              </p>
            </div>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white/20">
            <Activity aria-hidden="true" className="size-4" />
          </div>
        </div>
        <ul className="divide-y divide-white/5 font-sans text-sm">
          <Row
            delay="[animation-delay:0.2s]"
            icon={
              <div className={cx(iconBox, "bg-blue-500/10 text-blue-400")}>
                <Server aria-hidden="true" className="size-3.5" />
              </div>
            }
            title="GET /health"
            caption="Measured from your browser just now"
            aside={
              health.state === "up" ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{health.roundTripMs}ms</span>
                  <LatencyBars roundTripMs={health.roundTripMs} />
                </span>
              ) : health.state === "checking" ? (
                <LoaderCircle
                  aria-label="Checking"
                  className="size-3.5 animate-spin text-zinc-400"
                />
              ) : (
                <span className="text-xs text-red-400">No answer</span>
              )
            }
          />
          <Row
            delay="[animation-delay:0.6s]"
            icon={
              <div className={cx(iconBox, "bg-purple-500/10 text-purple-400")}>
                <Network aria-hidden="true" className="size-3.5" />
              </div>
            }
            title="Algorand Mainnet"
            caption={`USDC · ASA ${String(seloFacts.usdcAsaId)}`}
            aside={
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
                x402 v2
              </span>
            }
          />
          <Row
            delay="[animation-delay:1s]"
            icon={
              <div className={cx(iconBox, "bg-orange-500/10 text-orange-400")}>
                <Coins aria-hidden="true" className="size-3.5" />
              </div>
            }
            title="POST /v1/release-test"
            caption={`${seloFacts.releaseTestPriceUsdc} USDC per release test`}
            aside={
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-normal text-emerald-400">
                Paid
              </span>
            }
          />
        </ul>
      </div>
    </div>
  );
}
