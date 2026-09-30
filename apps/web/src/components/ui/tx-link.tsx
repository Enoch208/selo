import { ArrowUpRight } from "lucide-react";
import { cx } from "../../lib/cx";
import { explorerTx, shortId } from "../../lib/links";

interface TxLinkProps {
  readonly txId: string;
  readonly full?: boolean;
  readonly className?: string;
}

export function TxLink({ txId, full = false, className }: TxLinkProps) {
  return (
    <a
      href={explorerTx(txId)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Transaction ${txId} on the Algorand explorer`}
      className={cx(
        "group/tx inline-flex max-w-full items-center gap-1 font-mono text-xs text-zinc-300 underline decoration-white/15 underline-offset-4 transition-colors hover:text-white hover:decoration-white/60",
        className,
      )}
    >
      <span className={full ? "break-all" : "truncate"}>{full ? txId : shortId(txId)}</span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-3 shrink-0 transition-transform group-hover/tx:-translate-y-0.5 group-hover/tx:translate-x-0.5"
      />
    </a>
  );
}
