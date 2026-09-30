import type { ReactNode } from "react";
import { DotField } from "./dot-field";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { TopBlur } from "./top-blur";

interface SiteShellProps {
  readonly children: ReactNode;
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-white antialiased selection:bg-orange-500/30 selection:text-orange-200">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-black"
      >
        Skip to content
      </a>
      <DotField />
      <TopBlur />
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
