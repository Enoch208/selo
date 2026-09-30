import arrowUp from "@iconify-icons/solar/arrow-up-bold-duotone";
import { links } from "../../lib/links";
import { SolarIcon } from "../ui/solar-icon";
import { FooterMark } from "./footer-mark";

interface FooterLink {
  readonly label: string;
  readonly href: string;
}

const columns: readonly { readonly title: string; readonly items: readonly FooterLink[] }[] = [
  {
    title: "Product",
    items: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Checks", href: "/#checks" },
      { label: "Test an endpoint", href: "/test" },
    ],
  },
  {
    title: "Proof",
    items: [
      { label: "On-chain proof", href: "/#proof" },
      { label: "Claims ledger", href: links.claims },
      { label: "Evidence", href: links.evidence },
    ],
  },
  {
    title: "Developers",
    items: [
      { label: "API docs", href: links.apiDocs },
      { label: "GitHub", href: links.repo },
      { label: "Agent card", href: "/.well-known/agent-card.json" },
    ],
  },
];

function backToTop(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

export function SiteFooter() {
  return (
    <footer className="relative z-20 w-full border-t border-white/5 bg-zinc-900/30 pb-8 pt-24 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-24 grid gap-16 lg:grid-cols-12">
          <div className="flex flex-col lg:col-span-5">
            <FooterMark />
            <p className="mb-4 font-manrope text-5xl font-medium tracking-tighter text-white">
              Selo<span className="text-zinc-600">.</span>
            </p>
            <p className="max-w-xs font-sans text-sm text-zinc-400">
              CI for x402. It pays your endpoint before your users do.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-10 md:grid-cols-3">
              {columns.map((column) => (
                <div key={column.title} className="flex flex-col gap-8">
                  <h2 className="font-manrope text-base font-medium text-white">{column.title}</h2>
                  <ul className="flex flex-col gap-4">
                    {column.items.map((item) => (
                      <li key={item.label}>
                        <a
                          href={item.href}
                          className="font-sans text-sm text-zinc-400 transition-colors hover:text-white"
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-6 border-t border-white/5 pt-8 md:flex-row">
          <p className="font-sans text-xs text-zinc-400">Selo · Algorand x402 release gate</p>
          <button
            type="button"
            onClick={backToTop}
            className="group flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-zinc-400 transition-colors hover:text-white"
          >
            Back to top
            <span className="flex size-6 items-center justify-center rounded-sm border border-zinc-800 transition-all group-hover:border-zinc-600 group-hover:bg-zinc-800">
              <SolarIcon icon={arrowUp} />
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
