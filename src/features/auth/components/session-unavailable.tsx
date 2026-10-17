"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fillSeconds } from "../lib/session-view";
import type { SessionTexts } from "./session-screens";

type SessionUnavailableProps = {
  texts: SessionTexts;
  /** Seconds to wait after a 429, or null. */
  waitSeconds: number | null;
  onRetry(): void;
  onSignOut(): void;
};

/** The session could not be restored (network, 5xx, 429): the user is still signed in and may retry or sign out. */
export function SessionUnavailable({ texts, waitSeconds, onRetry, onSignOut }: SessionUnavailableProps) {
  return (
    <div className="space-y-4 py-6">
      <Alert tone="error" title={texts.unavailableTitle}>
        <p>{texts.unavailableBody}</p>
        {waitSeconds !== null && <p className="mt-1">{fillSeconds(texts.rateLimited, waitSeconds)}</p>}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onRetry}>
          {texts.retry}
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          {texts.signOutHere}
        </Button>
      </div>
    </div>
  );
}
