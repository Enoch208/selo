import { useLayoutEffect } from "react";

const gateSelector = ".in-view-gate";

export function useLandingMotion(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" },
    );
    for (const element of document.querySelectorAll(gateSelector)) {
      observer.observe(element);
    }
    root.dataset.motion = "on";
    return () => {
      observer.disconnect();
      delete root.dataset.motion;
    };
  }, []);
}
