"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** What is wrong with a part of a step that has no field of its own to focus. It takes focus, so it is seen and read out. */
export function FieldProblem({ id, children }: { id?: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} id={id} tabIndex={-1} role="alert" className="text-sm text-rose-600 focus:outline-none">
      {children}
    </p>
  );
}
