import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { CheckList } from "../components/report/check-list";
import { MoneyPanel } from "../components/report/money-panel";
import { VerdictBanner } from "../components/report/verdict-banner";
import { FailureNotice } from "../components/ui/failure-notice";
import { getJson, type ApiFailure } from "../lib/api";
import { useDocumentTitle } from "../lib/use-document-title";
import { useNoIndex } from "../lib/use-no-index";
import { reportSchema, type ReportView } from "../lib/wire";

type Load =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly report: ReportView }
  | { readonly state: "missing" }
  | { readonly state: "failed"; readonly failure: ApiFailure };

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function useReport(token: string): Load {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    let live = true;
    if (!tokenPattern.test(token)) {
      setLoad({ state: "missing" });
      return;
    }
    setLoad({ state: "loading" });
    void getJson(`/v1/reports/${encodeURIComponent(token)}`, reportSchema).then((result) => {
      if (!live) {
        return;
      }
      if (result.ok) {
        setLoad({ state: "ready", report: result.data });
      } else if (result.failure.kind === "http" && result.failure.status === 404) {
        setLoad({ state: "missing" });
      } else {
        setLoad({ state: "failed", failure: result.failure });
      }
    });
    return () => {
      live = false;
    };
  }, [token]);
  return load;
}

function formatTime(value: string | null): string {
  return value === null ? "Not recorded" : new Date(value).toLocaleString();
}

const panel =
  "edge rounded-[2rem] bg-gradient-to-br from-white/5 to-white/0 p-8 backdrop-blur-lg md:p-10";

export default function ReportPage() {
  useDocumentTitle("Release report · Selo");
  useNoIndex();
  const { token = "" } = useParams();
  const load = useReport(token);

  return (
    <div className="relative z-20 mx-auto w-full max-w-4xl px-6 pb-32 pt-40">
      <Link
        to="/test"
        className="mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        New test
      </Link>
      <p className="mb-6 font-mono text-xs tracking-widest text-zinc-400">SELO RELEASE REPORT</p>
      {load.state === "loading" ? (
        <p className="text-zinc-400" aria-live="polite">
          Loading the report…
        </p>
      ) : load.state === "missing" ? (
        <div className={panel}>
          <h1 className="mb-3 font-manrope text-3xl font-semibold text-white">Report not found</h1>
          <p className="text-zinc-400">
            This link does not match a finished report. Report links are private and unguessable;
            check that you copied the whole reportUrl.
          </p>
        </div>
      ) : load.state === "failed" ? (
        <FailureNotice failure={load.failure} />
      ) : (
        <div className="space-y-6">
          <section className={panel} aria-labelledby="report-target">
            <h1 id="report-target" className="mb-8 break-all font-mono text-sm text-zinc-300">
              <span className="text-orange-300">{load.report.target.method}</span>{" "}
              {load.report.target.url}
            </h1>
            <VerdictBanner verdict={load.report.verdict} />
            {load.report.inconclusiveReason === null ? null : (
              <p className="mt-4 font-mono text-xs text-sky-200">
                {load.report.inconclusiveReason}
              </p>
            )}
            <dl className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-400">Project</dt>
                <dd className="mt-1 text-zinc-100">{load.report.project}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-400">Tested</dt>
                <dd className="mt-1 text-zinc-100">{formatTime(load.report.testedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-400">Selo version</dt>
                <dd className="mt-1 font-mono text-zinc-100">{load.report.seloVersion}</dd>
              </div>
            </dl>
          </section>
          <section className={panel} aria-labelledby="report-checks">
            <h2 id="report-checks" className="mb-6 font-manrope text-xl font-semibold text-white">
              Checks
            </h2>
            <CheckList checks={load.report.checks} />
            {load.report.warnings.length === 0 ? null : (
              <ul className="mt-6 space-y-1 text-sm text-amber-200">
                {load.report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </section>
          <section className={panel} aria-labelledby="report-money">
            <h2 id="report-money" className="mb-4 font-manrope text-xl font-semibold text-white">
              Payments
            </h2>
            <MoneyPanel money={load.report.money} />
            <p className="mt-6 font-mono text-[11px] text-zinc-500">{load.report.jobId}</p>
          </section>
        </div>
      )}
    </div>
  );
}
