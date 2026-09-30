import type { ReactNode } from "react";
import type { ReportView } from "../../lib/wire";
import { TxLink } from "../ui/tx-link";

const zeroAmount = /^0+(\.0+)?$/;

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 py-3 last:border-none sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-xs uppercase tracking-wider text-zinc-400">{label}</dt>
      <dd className="min-w-0 text-sm text-zinc-100">{children}</dd>
    </div>
  );
}

export function MoneyPanel({ money }: { readonly money: ReportView["money"] }) {
  return (
    <dl>
      <Row label="Incoming Selo payment">
        {money.inboundTxId === null ? (
          <span className="text-zinc-400">Not recorded</span>
        ) : (
          <TxLink txId={money.inboundTxId} full />
        )}
      </Row>
      <Row label="Downstream payment">
        {money.downstreamTxIds.length === 0 ? (
          <span className="text-zinc-400">None settled</span>
        ) : (
          <span className="flex flex-col gap-1">
            {money.downstreamTxIds.map((txId) => (
              <TxLink key={txId} txId={txId} full />
            ))}
          </span>
        )}
      </Row>
      <Row label="Spend">
        <span className="font-geist">{money.downstreamSpendUsdc} USDC</span>
      </Row>
      {zeroAmount.test(money.unresolvedSpendUsdc) ? null : (
        <Row label="Held unresolved">
          <span className="font-geist text-amber-200">{money.unresolvedSpendUsdc} USDC</span>
        </Row>
      )}
    </dl>
  );
}
