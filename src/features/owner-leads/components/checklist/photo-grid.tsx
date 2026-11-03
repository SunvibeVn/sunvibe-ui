"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/vietnam-time";

import type { MediaPanelModel, PhotoBadge, PhotoCard } from "../../lib/checklist/media-panel-model";

import { PhotoHoldControls } from "./photo-hold-controls";
import { PhotoRemoveDialog } from "./photo-remove-dialog";
import { PhotoThumb } from "./photo-thumb";
import { PhotoViewer } from "./photo-viewer";
import { usePairText } from "./use-pair-text";

/** Where the grid is shown: the Edit panel, the read-only Edit, or the Preview section (view only). */
export type PhotoGridMode = "edit" | "readOnly" | "preview";

const BADGE_TONE: Record<PhotoBadge, BadgeTone> = {
  uploading: "info",
  processing: "info",
  ready: "success",
  held: "warning",
  notAccepted: "danger",
  notProcessed: "danger",
  removedWhileProcessing: "neutral",
  notUploaded: "neutral",
};

type CardProps = { photo: PhotoCard; mode: PhotoGridMode; onRemove(photo: PhotoCard): void; onOpen(photo: PhotoCard): void };

function Card({ photo, mode, onRemove, onOpen }: CardProps) {
  const t = useTranslations("OwnerLeads");
  const holdReason = (reason: string | null) =>
    reason === "SECURITY_INCIDENT" || reason === "CREDENTIAL_EXPOSURE" ? t(`checklist.media.holdReason.${reason}`) : "";
  return (
    <li id={`photo-${photo.id}`} className="scroll-mt-36 space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-sm md:scroll-mt-20">
      {photo.canView ? (
        <button
          type="button"
          onClick={() => onOpen(photo)}
          aria-label={t("checklist.media.grid.open", { no: photo.mediaNo })}
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <PhotoThumb mediaId={photo.id} mediaNo={photo.mediaNo} show />
        </button>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
          {t("checklist.media.grid.noImage")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{t("checklist.media.grid.photoNo", { no: photo.mediaNo })}</span>
        <Badge tone={BADGE_TONE[photo.badge]}>{t(`checklist.media.badge.${photo.badge}`)}</Badge>
      </div>
      {photo.statusReason !== null && photo.badge !== "held" && (
        <p className="break-words text-xs text-rose-700">{t(`checklist.media.reasons.${photo.statusReason}`)}</p>
      )}
      {photo.held !== null && (
        <p className="break-words text-xs text-amber-800">
          {photo.held.byName !== null || photo.held.reason !== null
            ? t("checklist.media.grid.heldBy", {
                name: photo.held.byName ?? t("checklist.media.grid.unknownName"),
                when: formatDateTime(photo.held.at),
                reason: holdReason(photo.held.reason),
              })
            : t("checklist.media.grid.held", { when: formatDateTime(photo.held.at) })}
        </p>
      )}
      {photo.caption !== null && <p className="whitespace-pre-wrap break-words text-slate-800">{photo.caption}</p>}
      <p className="break-words text-xs text-slate-500">
        {t("checklist.media.grid.uploadedBy", { name: photo.uploadedByName ?? t("checklist.media.grid.unknownName") })}
        {photo.uploadedAs !== null && ` · ${t("checklist.media.grid.uploadedAs", { code: photo.uploadedAs })}`}
      </p>
      {mode !== "preview" && (photo.canRemove || photo.canHold || photo.canRelease) && (
        <div className="flex flex-wrap items-start gap-2">
          {photo.canRemove && (
            <Button variant="ghost" className="px-3 py-1" onClick={() => onRemove(photo)}>
              {t("checklist.media.grid.remove")}
            </Button>
          )}
          <PhotoHoldControls photo={photo} />
        </div>
      )}
    </li>
  );
}

/**
 * The grid by placement and category (survey-media spec 6.2): status badges, "uploaded as" a renamed space, who
 * uploaded it; a held photo shows since when, without image and, for viewers without `canHold`, without its caption,
 * actor or reason. Only the holder of an editable checklist sees Remove, held photos included (SM-29).
 */
export function PhotoGrid({ model, mode }: { model: MediaPanelModel; mode: PhotoGridMode }) {
  const t = useTranslations("OwnerLeads");
  const pair = usePairText();
  const [removing, setRemoving] = useState<PhotoCard | null>(null);
  const [viewing, setViewing] = useState<{ photo: PhotoCard; spaceCode: string | null } | null>(null);
  const cards = (photos: readonly PhotoCard[], spaceCode: string | null) => (
    <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <Card key={photo.id} photo={photo} mode={mode} onRemove={setRemoving} onOpen={(open) => setViewing({ photo: open, spaceCode })} />
      ))}
    </ul>
  );
  return (
    <section aria-labelledby={`photo-grid-${mode}-title`} className="space-y-3">
      <h3 id={`photo-grid-${mode}-title`} className="text-sm font-semibold text-slate-900">
        {t("checklist.media.grid.title")}
      </h3>
      {model.groups.length === 0 ? (
        <p className="text-sm text-slate-600">{t("checklist.media.grid.empty")}</p>
      ) : (
        model.groups.map((group) => (
          <div key={`${group.spaceId ?? "asset"}-${group.category}`} className="space-y-2">
            <h4 className="break-words text-sm font-medium text-slate-700">{pair(group.spaceCode, group.category)}</h4>
            {cards(group.photos, group.spaceCode)}
          </div>
        ))
      )}
      {model.notAccepted.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700">{t("checklist.media.notAccepted.title")}</h4>
          {cards(model.notAccepted, null)}
        </div>
      )}
      {viewing !== null && (
        <PhotoViewer
          photo={viewing.photo}
          spaceCode={viewing.spaceCode}
          holdControls={mode !== "preview"}
          onRemove={
            mode === "preview"
              ? undefined
              : (photo) => {
                  setViewing(null);
                  setRemoving(photo);
                }
          }
          onClose={() => setViewing(null)}
        />
      )}
      {removing !== null && <PhotoRemoveDialog photo={removing} onClose={() => setRemoving(null)} />}
    </section>
  );
}
