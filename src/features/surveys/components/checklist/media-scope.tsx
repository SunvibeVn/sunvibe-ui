"use client";

import type { ReactNode } from "react";

import { useChecklistPage } from "./checklist-context";
import { MediaProvider } from "./media-context";
import { useMedia } from "./use-media";

function MediaRoot({ children }: { children: ReactNode }) {
  const media = useMedia(useChecklistPage());
  return <MediaProvider value={media}>{children}</MediaProvider>;
}

/**
 * The photos of the checklist on screen for its parts (survey-media spec 6.2): only while the read says photos are
 * available (A-1); otherwise the W16 placeholder and texts stay. Remounted for another user or checklist, so nothing of
 * the previous one (uploads, images) stays.
 */
export function ChecklistMediaScope({ children }: { children: ReactNode }) {
  const { view, userId, checklistId } = useChecklistPage();
  if (view.media?.available !== true) return <MediaProvider value={null}>{children}</MediaProvider>;
  return <MediaRoot key={`${userId}:${checklistId}`}>{children}</MediaRoot>;
}
