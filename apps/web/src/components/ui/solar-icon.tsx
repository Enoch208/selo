import { Icon } from "@iconify/react";
import type { IconifyIcon } from "@iconify/react";

interface SolarIconProps {
  readonly icon: IconifyIcon;
  readonly className?: string;
}

export function SolarIcon({ icon, className }: SolarIconProps) {
  return <Icon icon={icon} aria-hidden="true" className={className} />;
}
