"use client";

import { useEffect, useSyncExternalStore } from "react";

import { CHECKLIST_GROUP_PATHS } from "@/features/surveys";

import { checklistDraftKey } from "../../lib/checklist/checklist-draft";
import { hasUnsavedChanges } from "../../lib/checklist/unsaved";
import { tabDrafts } from "../../lib/drafts";

/**
 * Asks before leaving the page or the tab while a group has unsaved changes (survey-checklist spec 6.2): the browser's
 * own prompt on unload, a confirm on a link inside the app. The drafts stay in tab memory either way.
 */
export function useLeaveGuard(key: { userId: string; leadId: string; checklistId: string }, confirmText: string): boolean {
  const { userId, leadId, checklistId } = key;
  const dirty = useSyncExternalStore(
    tabDrafts.subscribe,
    () =>
      hasUnsavedChanges(
        CHECKLIST_GROUP_PATHS.map((group) => tabDrafts.get(checklistDraftKey({ userId, leadId, checklistId, group })) ?? ""),
      ),
    () => false,
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(confirmText)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirmText]);

  return dirty;
}
