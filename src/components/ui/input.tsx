import type { InputHTMLAttributes } from "react";

import { controlClass } from "./control-class";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Smaller box with a tighter radius and no shadow, used by the auth cards. */
  compact?: boolean;
};

export function Input({ invalid = false, compact = false, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${controlClass({ invalid, compact })} ${className}`}
      {...props}
    />
  );
}
