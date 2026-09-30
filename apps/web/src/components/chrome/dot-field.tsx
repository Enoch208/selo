import { lazy, Suspense, useEffect, useState } from "react";

const DotFieldCanvas = lazy(() => import("./dot-field-canvas"));

export function DotField() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setReady(true);
    }, 300);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="dot-field pointer-events-none fixed top-0 z-10 h-screen w-full opacity-50 mix-blend-screen brightness-50 saturate-0"
    >
      {ready ? (
        <Suspense fallback={null}>
          <DotFieldCanvas />
        </Suspense>
      ) : null}
    </div>
  );
}
