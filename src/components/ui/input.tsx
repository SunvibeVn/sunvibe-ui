import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ invalid = false, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
        invalid
          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
          : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
      } ${className}`}
      {...props}
    />
  );
}
