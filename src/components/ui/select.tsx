import type { SelectHTMLAttributes } from "react";

import { controlClass } from "./control-class";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  /** The smaller box of a compact Input, e.g. next to one in a table row. */
  compact?: boolean;
};

/** Native select with the Input box styling. */
export function Select({ invalid = false, compact = false, className = "", ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`${controlClass({ invalid, compact })} ${className}`}
      {...props}
    />
  );
}
