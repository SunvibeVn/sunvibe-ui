"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Submit button that shows a spinner and blocks double submits while its form's action runs. */
export function SubmitButton({
  children,
  variant = "primary",
  fullWidth = true,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} pending={pending}>
      {children}
    </Button>
  );
}
