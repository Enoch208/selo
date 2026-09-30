import { cx } from "../../lib/cx";
import { BrandMark } from "./brand-mark";

interface WordmarkProps {
  readonly className?: string;
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark size={22} />
      <span className={cx("font-sans font-medium tracking-tight text-white", className)}>Selo</span>
    </span>
  );
}
