import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Smaller box with a tighter radius and no shadow, used by the auth cards. */
  compact?: boolean;
};

/** Font size stays 16px on phones: iOS Safari zooms the page when a focused input is smaller than that. */
export function Input({ invalid = false, compact = false, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`block w-full border bg-white text-base text-slate-900 sm:text-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
        compact ? "rounded-lg px-3 py-2" : "rounded-xl px-4 py-3 shadow-sm"
      } ${
        invalid
          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
          : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
      } ${className}`}
      {...props}
    />
  );
}
