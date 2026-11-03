"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import type { MediaVariant } from "@/features/surveys";

import { useChecklistMedia } from "./media-context";

type PhotoThumbProps = {
  mediaId: string;
  mediaNo: number;
  /** Read only for a photo the list marks servable while serving is on (spec 6.2). */
  show: boolean;
  variant?: Exclude<MediaVariant, "full">;
  /** The image's text alternative; "Photo #<mediaNo>" by default. */
  alt?: string;
  className?: string;
};

/**
 * One image of a photo from page memory (survey-media spec 6.2 images): an object URL made from the API's JPEG, never a
 * URL of the API itself and never `next/image`; the placeholder while it loads, waits for Retry-After or is not shown.
 */
export function PhotoThumb({ mediaId, mediaNo, show, variant = "thumbnail", alt, className = "" }: PhotoThumbProps) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const requestImage = media?.requestImage;
  const epoch = media?.imageEpoch ?? 0;
  const entry = show ? media?.image(mediaId, variant) : undefined;
  const missing = entry === undefined;
  // Asks once per photo and variant, and again only when reads may start again (`epoch`, review M-1).
  useEffect(() => {
    if (show && missing) requestImage?.(mediaId, variant);
  }, [show, missing, requestImage, mediaId, variant, epoch]);
  if (entry?.state === "ready") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a blob: object URL from memory; next/image is not allowed here (spec 6.2)
      <img src={entry.url} alt={alt ?? t("checklist.media.grid.photoNo", { no: mediaNo })} className={`h-full w-full object-contain ${className}`} />
    );
  }
  if (entry?.state === "waiting" && entry.budgetMinutes !== undefined) {
    return (
      <span className={`flex h-full w-full items-center justify-center p-2 text-center text-xs text-slate-600 ${className}`}>
        {t("checklist.media.errors.rateBudget", { minutes: entry.budgetMinutes })}
      </span>
    );
  }
  const loading = entry?.state === "loading" || entry?.state === "waiting";
  return (
    <span role={loading ? "status" : undefined} className={`flex h-full w-full items-center justify-center text-xs text-slate-500 ${className}`}>
      {loading ? t("checklist.media.viewer.loading") : t("checklist.media.grid.noImage")}
    </span>
  );
}
