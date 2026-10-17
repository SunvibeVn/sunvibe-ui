"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type LogoutFailedProps = {
  text: string;
  tryAgainLabel: string;
  onTryAgain(): void;
  tryingAgain: boolean;
};

/** Signed out in this tab, but the server session could not be ended (C-5): a warning and a retry. */
export function LogoutFailed({ text, tryAgainLabel, onTryAgain, tryingAgain }: LogoutFailedProps) {
  return (
    <div className="space-y-4 py-6">
      <Alert tone="error">{text}</Alert>
      <Button variant="secondary" pending={tryingAgain} onClick={onTryAgain}>
        {tryAgainLabel}
      </Button>
    </div>
  );
}
