import { TriangleAlert } from "lucide-react";
import type { ApiFailure } from "../../lib/api";
import { describeFailure } from "../../lib/error-text";

export function FailureNotice({ failure }: { readonly failure: ApiFailure }) {
  const text = describeFailure(failure);
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-400" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-red-200">{text.title}</p>
        {text.detail === null ? null : (
          <p className="mt-1 break-words font-mono text-xs text-red-300/80">{text.detail}</p>
        )}
      </div>
    </div>
  );
}
