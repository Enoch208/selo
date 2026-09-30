import { siAlgorand } from "simple-icons";
import { BrandGlyph } from "../../ui/brand-glyph";

interface Mark {
  readonly name: string;
  readonly glyph: boolean;
}

const marks: readonly Mark[] = [
  { name: "Algorand", glyph: true },
  { name: "x402", glyph: false },
  { name: "USDC", glyph: false },
  { name: "Bazaar", glyph: false },
  { name: "GoPlausible", glyph: false },
];

function MarkRow({ hidden }: { readonly hidden: boolean }) {
  return (
    <ul aria-hidden={hidden} className="flex items-center">
      {marks.map((mark) => (
        <li key={mark.name} className="mx-8 flex items-center gap-2">
          {mark.glyph ? <BrandGlyph icon={siAlgorand} className="text-2xl text-white" /> : null}
          <span className="font-sans text-lg font-medium tracking-tight text-white">
            {mark.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BuiltOn() {
  return (
    <div className="enter relative z-20 mx-auto w-full max-w-6xl px-6 pb-12 [animation-delay:1.8s] md:pb-20">
      <div className="marquee-host fade-sides inline-flex w-full flex-nowrap overflow-hidden opacity-40 grayscale transition-all duration-700 hover:grayscale-0">
        <div className="marquee flex w-max items-center">
          <MarkRow hidden={false} />
          <MarkRow hidden />
          <MarkRow hidden />
          <MarkRow hidden />
        </div>
      </div>
    </div>
  );
}
