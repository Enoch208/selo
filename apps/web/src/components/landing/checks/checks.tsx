import { ChecksPanel } from "./checks-panel";
import { ReportPhone } from "./report-phone";

export function Checks() {
  return (
    <section
      id="checks"
      aria-labelledby="checks-title"
      className="relative z-20 mx-auto mb-32 mt-0 w-full max-w-7xl scroll-mt-28 overflow-hidden py-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-full -translate-x-1/2 -translate-y-1/2 select-none"
      >
        <p className="whitespace-nowrap text-center font-manrope text-[12vw] font-bold leading-none tracking-tighter text-white/[0.03]">
          RELEASE GATE
        </p>
      </div>
      <div className="relative z-10 grid items-center gap-8 px-6 lg:grid-cols-12">
        <div className="order-2 flex flex-col justify-center lg:order-1 lg:col-span-4">
          <div className="mb-6 flex items-center gap-2 opacity-60">
            <span className="size-2 rounded-full bg-orange-500" />
            <span className="font-mono text-xs tracking-widest text-gray-300">02/04</span>
          </div>
          <h2
            id="checks-title"
            className="mb-8 font-manrope text-4xl font-normal uppercase leading-[1.1] tracking-tight text-white md:text-7xl"
          >
            Five checks. <span className="text-gray-500">One release</span>{" "}
            <span className="bg-gradient-to-r from-orange-400 to-orange-200 bg-clip-text text-transparent">
              gate.
            </span>
          </h2>
          <div aria-hidden="true" className="mt-4 hidden h-px w-24 bg-white/10 lg:block" />
        </div>
        <div className="relative order-1 flex justify-center py-12 lg:order-2 lg:col-span-4 lg:py-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/20 blur-[100px]"
          />
          <figure aria-label="Example release report, schematic">
            <ReportPhone />
          </figure>
        </div>
        <ChecksPanel />
      </div>
    </section>
  );
}
