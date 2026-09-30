const staticWord =
  "inline-flex bg-gradient-to-b from-white via-white to-white/50 bg-clip-text text-transparent opacity-60";
const easing = "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]";

const leading = ["Ship"] as const;
const rolling = ["x402", "endpoints"] as const;
const trailing = ["with", "confidence."] as const;

function RollingWord({ word, offset }: { readonly word: string; readonly offset: number }) {
  return (
    <span className="inline-flex">
      {Array.from(word).map((letter, index) => {
        const delay = { transitionDelay: `${String((offset + index) * 25)}ms` };
        return (
          <span key={index} className="relative inline-block h-[1.1em] overflow-hidden">
            <span
              style={delay}
              className={`block bg-gradient-to-b from-white via-white to-white/50 bg-clip-text text-transparent group-hover:-translate-y-full ${easing}`}
            >
              {letter}
            </span>
            <span
              style={delay}
              className={`absolute left-0 top-0 block translate-y-full text-orange-400 group-hover:translate-y-0 ${easing}`}
            >
              {letter}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function HeroHeadline() {
  return (
    <h1
      id="hero-title"
      className="enter mb-8 cursor-default font-manrope text-6xl font-medium leading-[1.1] tracking-tighter [animation-delay:1s] md:text-8xl"
    >
      <span className="sr-only">Ship x402 endpoints with confidence.</span>
      <span aria-hidden="true" className="flex flex-wrap justify-center gap-x-[0.25em] gap-y-2">
        {leading.map((word) => (
          <span key={word} className={staticWord}>
            {word}
          </span>
        ))}
        <span className="group inline-flex cursor-pointer select-none flex-wrap justify-center gap-x-[0.25em]">
          {rolling.map((word, index) => (
            <RollingWord key={word} word={word} offset={rolling.slice(0, index).join("").length} />
          ))}
        </span>
        {trailing.map((word) => (
          <span key={word} className={staticWord}>
            {word}
          </span>
        ))}
      </span>
    </h1>
  );
}
