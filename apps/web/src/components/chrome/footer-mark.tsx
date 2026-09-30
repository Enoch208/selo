import { BrandMark } from "./brand-mark";

export function FooterMark() {
  return (
    <div
      aria-hidden="true"
      className="mb-10 w-fit opacity-90 transition-opacity duration-500 hover:opacity-100"
    >
      <BrandMark size={56} className="shadow-[0_0_30px_rgba(255,255,255,0.08)]" />
    </div>
  );
}
