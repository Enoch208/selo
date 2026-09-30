import type { HttpMethod } from "@selo/core";
import { cx } from "../../lib/cx";

const methods: readonly HttpMethod[] = ["GET", "POST"];

interface MethodToggleProps {
  readonly name: string;
  readonly value: HttpMethod;
  readonly onChange: (method: HttpMethod) => void;
}

export function MethodToggle({ name, value, onChange }: MethodToggleProps) {
  return (
    <fieldset className="border-b border-white/10 pb-2">
      <legend className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-zinc-400">
        Method
      </legend>
      <div className="flex gap-2">
        {methods.map((method) => (
          <label
            key={method}
            className={cx(
              "cursor-pointer rounded-full border px-4 py-1.5 font-mono text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange-400",
              value === method
                ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                : "border-white/10 text-zinc-400 hover:text-white",
            )}
          >
            <input
              type="radio"
              name={name}
              value={method}
              checked={value === method}
              onChange={() => {
                onChange(method);
              }}
              className="sr-only"
            />
            {method}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
