import { useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router";
import { reportPath, reportTokenFrom } from "../../lib/routes";
import { FloatingField } from "../ui/floating-field";
import { PrimaryButton } from "../ui/primary-button";

export function ReportLinkStep() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const token = reportTokenFrom(value);
    setInvalid(token === null);
    if (token !== null) {
      void navigate(reportPath(token));
    }
  }

  return (
    <form className="space-y-8" onSubmit={submit}>
      <p className="text-sm leading-relaxed text-zinc-300">
        The paid response carries a private <span className="font-mono text-white">reportUrl</span>.
        Paste it here to read the report: verdict, the five checks and both payment legs.
      </p>
      <FloatingField
        id="report-link"
        label="Report link or token"
        required
        value={value}
        onChange={setValue}
      />
      {invalid ? (
        <p role="alert" className="text-sm text-amber-200">
          That does not look like a Selo report link. It ends in a 43-character token.
        </p>
      ) : null}
      <div className="flex justify-end">
        <PrimaryButton type="submit">Open report</PrimaryButton>
      </div>
    </form>
  );
}
