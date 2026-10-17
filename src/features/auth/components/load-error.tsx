"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AUTH_ERROR_TEXT } from "../lib/auth-error-text";

/** A signed-in page could not load its data (network, 5xx, 403): the session is kept and the user may retry. */
export function LoadError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="space-y-4 py-6">
      <Alert tone="error">{AUTH_ERROR_TEXT.generic}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
