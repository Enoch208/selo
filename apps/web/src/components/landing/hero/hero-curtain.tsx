import { cx } from "../../../lib/cx";

interface Column {
  readonly height: string;
  readonly delay: string;
  readonly edge: string;
  readonly mobile?: boolean;
}

const columns: readonly Column[] = [
  { height: "h-[75%]", delay: "[animation-delay:0.1s]", edge: "border-r" },
  { height: "h-[65%]", delay: "[animation-delay:0.2s]", edge: "border-r" },
  { height: "h-[55%]", delay: "[animation-delay:0.3s]", edge: "border-r" },
  {
    height: "h-[45%]",
    delay: "[animation-delay:0.4s]",
    edge: "border-r md:border-none",
    mobile: true,
  },
  { height: "h-[55%]", delay: "[animation-delay:0.5s]", edge: "border-l" },
  { height: "h-[65%]", delay: "[animation-delay:0.6s]", edge: "border-l" },
  { height: "h-[75%]", delay: "[animation-delay:0.7s]", edge: "border-l" },
];

export function HeroCurtain() {
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 -z-20">
        <div className="absolute left-1/2 top-[-10%] h-[80%] w-[120%] -translate-x-1/2 bg-radial-[ellipse_at_top] from-white/10 via-zinc-900/20 to-black" />
        <div className="grain absolute inset-0 opacity-20 mix-blend-overlay" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 grid h-full w-full grid-cols-1 md:grid-cols-7"
      >
        {columns.map((column, index) => (
          <div
            key={index}
            className={cx(
              "column-in relative h-full border-white/5",
              column.mobile === true ? "" : "hidden md:block",
              column.edge,
              column.delay,
            )}
          >
            <div
              className={cx(
                "absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)]",
                column.height,
              )}
            />
            {column.mobile === true ? (
              <div className="pointer-events-none absolute left-0 right-0 top-[20%] h-[30%] bg-gradient-to-b from-white/5 to-transparent" />
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
