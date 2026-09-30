import type { ReactNode } from "react";

const keyword = "text-purple-400";
const fn = "text-blue-400";
const str = "text-emerald-400";
const type = "text-orange-200";
const muted = "text-gray-500";

function Line({
  children,
  indent = 0,
}: {
  readonly children?: ReactNode;
  readonly indent?: 0 | 1 | 2;
}) {
  const pad = indent === 0 ? "" : indent === 1 ? "pl-4" : "pl-8";
  return <p className={children === undefined ? "h-4" : pad}>{children}</p>;
}

export function CodePanel({ origin }: { readonly origin: string }) {
  return (
    <div className="absolute inset-0 p-8 text-xs leading-relaxed text-gray-500 opacity-40 md:text-sm">
      <div aria-hidden="true" className="mb-6 flex gap-1.5 opacity-50">
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
      </div>
      <div className="space-y-1 overflow-hidden whitespace-pre font-mono">
        <Line>
          <span className={muted}># free: is the target testable, and what will it cost?</span>
        </Line>
        <Line>
          <span className={fn}>curl</span> -X POST {origin}/v1/preflight \
        </Line>
        <Line indent={1}>
          -H <span className={str}>&quot;content-type: application/json&quot;</span> \
        </Line>
        <Line indent={1}>
          -d{" "}
          <span className={str}>
            &apos;{"{"}
            &quot;authorizationId&quot;:&quot;auth_…&quot;,&quot;targetUrl&quot;:&quot;https://…&quot;,&quot;method&quot;:&quot;POST&quot;
            {"}"}&apos;
          </span>
        </Line>
        <Line />
        <Line>
          <span className={keyword}>const</span> http = <span className={keyword}>new</span>{" "}
          <span className={type}>x402HTTPClient</span>(<span className={keyword}>new</span>{" "}
          <span className={type}>x402Client</span>()
        </Line>
        <Line indent={1}>
          .<span className={fn}>register</span>(<span className={str}>&quot;algorand:*&quot;</span>,{" "}
          <span className={keyword}>new</span> <span className={type}>ExactAvmScheme</span>
          (signer)));
        </Line>
        <Line>
          <span className={keyword}>const</span> first = <span className={keyword}>await</span>{" "}
          <span className={fn}>fetch</span>(releaseTest, init);
        </Line>
        <Line>
          <span className={keyword}>const</span> required = http.
          <span className={fn}>getPaymentRequiredResponse</span>(
        </Line>
        <Line indent={1}>
          (name) =&gt; first.headers.<span className={fn}>get</span>(name),{" "}
          <span className={keyword}>await</span> first.<span className={fn}>json</span>());
        </Line>
        <Line>
          <span className={keyword}>const</span> signature = http.
          <span className={fn}>encodePaymentSignatureHeader</span>(
        </Line>
        <Line indent={1}>
          <span className={keyword}>await</span> http.
          <span className={fn}>createPaymentPayload</span>(required));
        </Line>
        <Line>
          <span className={keyword}>const</span> paid = <span className={keyword}>await</span>{" "}
          <span className={fn}>fetch</span>(releaseTest, {"{"} ...init,
        </Line>
        <Line indent={1}>
          headers: {"{"} ...init.headers, ...signature {"}"} {"}"});
        </Line>
        <Line>
          <span className={keyword}>const</span> {"{"} verdict, reportUrl {"}"} ={" "}
          <span className={keyword}>await</span> paid.<span className={fn}>json</span>();
        </Line>
      </div>
    </div>
  );
}
