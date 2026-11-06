"use client";

import { useEffect } from "react";
import { flushSync } from "react-dom";

/**
 * Runs when the browser leaves the page, which may keep it whole for Back (bfcache). Secrets on screen go then: Activity
 * clears them inside the app, and this covers a leave to another site. The update is flushed at once, because a frozen page
 * runs no more tasks and would come back still showing them. `forget` must be stable.
 */
export function usePageHide(forget: () => void): void {
  useEffect(() => {
    const onHide = () => flushSync(forget);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [forget]);
}
