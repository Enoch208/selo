import { Link } from "react-router";
import { links } from "../../lib/links";
import { SpinBorderLink } from "../ui/spin-border-link";
import { Wordmark } from "./wordmark";

const sections = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Checks", href: "/#checks" },
  { label: "Proof", href: "/#proof" },
] as const;

const linkClass = "font-sans text-xs font-medium text-gray-400 transition-colors hover:text-white";

export function SiteNav() {
  return (
    <div className="fixed left-0 top-0 z-50 flex w-full justify-center px-4 pt-6">
      <nav
        aria-label="Primary"
        className="edge edge-bright flex w-full max-w-5xl items-center justify-between gap-8 rounded-full bg-black/60 py-2 pl-6 pr-2 shadow-2xl shadow-black/50 backdrop-blur-xl md:w-auto md:gap-12"
      >
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Selo home">
          <Wordmark className="text-base" />
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {sections.map((section) => (
            <a key={section.href} href={section.href} className={linkClass}>
              {section.label}
            </a>
          ))}
          <a href={links.apiDocs} className={linkClass}>
            Docs
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <a
            href={links.repo}
            className="hidden font-sans text-xs font-medium text-gray-300 transition-colors hover:text-white md:block"
          >
            GitHub
          </a>
          <SpinBorderLink to="/test">Test an endpoint</SpinBorderLink>
        </div>
      </nav>
    </div>
  );
}
