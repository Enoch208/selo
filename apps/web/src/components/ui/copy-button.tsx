import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
  readonly value: string;
  readonly label: string;
}

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({ value, label }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  function copy(): void {
    navigator.clipboard.writeText(value).then(
      () => {
        setState("copied");
      },
      () => {
        setState("failed");
      },
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
    >
      {state === "copied" ? (
        <Check aria-hidden="true" className="size-3 text-emerald-400" />
      ) : (
        <Copy aria-hidden="true" className="size-3" />
      )}
      <span>{state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}</span>
    </button>
  );
}
