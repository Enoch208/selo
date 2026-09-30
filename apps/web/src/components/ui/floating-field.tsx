import type { ChangeEvent } from "react";

interface FloatingFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: "text" | "url" | "email";
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly hint?: string;
}

export function FloatingField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  autoComplete = "off",
  hint,
}: FloatingFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className="group relative">
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={label}
        aria-describedby={hintId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value);
        }}
        className="peer w-full border-b border-white/10 bg-transparent py-3 font-sans text-lg text-white placeholder:text-transparent transition-colors focus:border-orange-500 focus:outline-none"
      />
      <label
        htmlFor={id}
        className="absolute -top-5 left-0 font-sans text-xs font-medium uppercase tracking-wider text-zinc-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:text-zinc-400 peer-focus:-top-5 peer-focus:text-[10px] peer-focus:text-orange-500"
      >
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={hintId} className="mt-2 text-xs text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  );
}
