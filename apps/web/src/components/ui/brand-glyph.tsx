import type { SimpleIcon } from "simple-icons";

interface BrandGlyphProps {
  readonly icon: SimpleIcon;
  readonly className?: string;
}

export function BrandGlyph({ icon, className }: BrandGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <path fill="currentColor" d={icon.path} />
    </svg>
  );
}
