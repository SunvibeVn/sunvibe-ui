import type { SelectHTMLAttributes } from "react";

import { controlClass } from "./control-class";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

/** Native select with the Input box styling. */
export function Select({ invalid = false, className = "", ...props }: SelectProps) {
  return <select aria-invalid={invalid || undefined} className={`${controlClass({ invalid })} ${className}`} {...props} />;
}
