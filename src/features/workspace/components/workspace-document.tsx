"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { englishSessionTexts } from "@/features/auth/client";
import { loadedOutsideWorkspace } from "../lib/document-load";

const noSubscription = () => () => {};

/**
 * A document that reached the workspace from a page outside it loads the page again first, so the workspace's own
 * response headers (CSP, framing) apply (SM-FE-06); nothing of the workspace renders or reads before that, not even
 * the session restore. A document loaded in the workspace renders its children (also on the server).
 */
export function WorkspaceDocument({ children }: { children: ReactNode }) {
  const outside = useSyncExternalStore(
    noSubscription,
    () => loadedOutsideWorkspace(window.performance),
    () => false,
  );
  useEffect(() => {
    // reload(), not replace(href): the same URL with a #fragment would only scroll.
    if (outside) window.location.reload();
  }, [outside]);
  if (outside) {
    return (
      <p role="status" className="py-10 text-center text-sm text-slate-500">
        {englishSessionTexts.loading}
      </p>
    );
  }
  return children;
}
