import seloMark from "../../assets/brand/selo-mark.webp";
import { cx } from "../../lib/cx";

interface BrandMarkProps {
  readonly size: number;
  readonly className?: string;
}

export function BrandMark({ size, className }: BrandMarkProps) {
  return (
    <img
      src={seloMark}
      alt=""
      width={size}
      height={size}
      className={cx("shrink-0 rounded-[22%] ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    />
  );
}
