import type { TextareaHTMLAttributes } from "react";

import { controlClass } from "./control-class";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

/** Multi-line text with the Input box styling. */
export function Textarea({ invalid = false, className = "", ...props }: TextareaProps) {
  return <textarea aria-invalid={invalid || undefined} className={`${controlClass({ invalid })} ${className}`} {...props} />;
}
