const nodes = [
  { x: 24, y: 52, label: "you" },
  { x: 140, y: 40, label: "selo" },
  { x: 256, y: 28, label: "target" },
] as const;

export function PaymentFlow() {
  return (
    <div className="relative mb-4 w-full">
      <svg viewBox="0 0 280 84" className="h-[84px] w-full overflow-visible" aria-hidden="true">
        <defs>
          <pattern id="flow-grid" width="40" height="84" patternUnits="userSpaceOnUse">
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="84"
              stroke="#3f3f46"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.3"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#flow-grid)" />
        <line x1="0" y1="84" x2="280" y2="84" stroke="#3f3f46" strokeWidth="1" opacity="0.5" />
        <path
          d="M24,52 C60,10 104,10 140,40"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M140,40 C176,70 220,70 256,28"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 4"
          opacity="0.7"
        />
        {nodes.map((node, index) => (
          <circle
            key={node.label}
            cx={node.x}
            cy={node.y}
            r="4"
            fill="#18181b"
            stroke="#f97316"
            strokeWidth="2"
            className={index === 1 ? "animate-pulse" : undefined}
          />
        ))}
      </svg>
      <div className="flex justify-between px-1 pt-2">
        <span className="rounded-sm px-2 py-0.5 text-[9px] font-semibold text-zinc-400">
          1 · pays Selo
        </span>
        <span className="rounded-sm border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold text-orange-500">
          settled first
        </span>
        <span className="rounded-sm px-2 py-0.5 text-[9px] font-semibold text-zinc-400">
          2 · Selo pays
        </span>
      </div>
    </div>
  );
}
