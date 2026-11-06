"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { MediaHoldReason, MediaUiError } from "@/features/surveys";

import { mediaErrorText } from "../../../surveys/lib/checklist/media-messages";
import type { PhotoCard } from "../../../surveys/lib/checklist/media-panel-model";

import { type MediaCommandOutcome, useChecklistMedia } from "./media-context";

const REASONS: readonly MediaHoldReason[] = ["SECURITY_INCIDENT", "CREDENTIAL_EXPOSURE"];
const SMALL = "px-3 py-1";

/**
 * Hold and Release of a photo for an ADMIN (survey-media A-23, spec 6.2): only with `canHold`, on any checklist state,
 * read-only drafts included. A hold needs one of its two reasons; no free text.
 */
export function PhotoHoldControls({ photo }: { photo: PhotoCard }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<MediaHoldReason | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MediaUiError | null>(null);
  if (media === null || (!photo.canHold && !photo.canRelease)) return null;

  const run = async (command: () => Promise<MediaCommandOutcome>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const outcome = await command();
    setPending(false);
    if (outcome.kind === "done") {
      setOpen(false);
      setReason("");
    } else {
      setError(outcome.error);
    }
  };

  const errorText = error === null ? null : mediaErrorText(error, t);
  return (
    <div className="space-y-2">
      {photo.canRelease ? (
        <Button variant="secondary" className={SMALL} pending={pending} onClick={() => void run(() => media.releasePhoto(photo.id))}>
          {t("checklist.media.hold.release")}
        </Button>
      ) : open ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
          <label htmlFor={reasonId} className="block text-xs font-medium text-slate-700">
            {t("checklist.media.hold.reason")}
          </label>
          <Select id={reasonId} compact value={reason} onChange={(event) => setReason(event.target.value as MediaHoldReason | "")}>
            <option value="">{t("checklist.panel.choose")}</option>
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`checklist.media.holdReason.${value}`)}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              className={SMALL}
              pending={pending}
              disabled={reason === ""}
              onClick={() => {
                if (reason !== "") void run(() => media.holdPhoto(photo.id, reason));
              }}
            >
              {t("checklist.media.hold.confirm")}
            </Button>
            <Button variant="ghost" className={SMALL} disabled={pending} onClick={() => setOpen(false)}>
              {t("checklist.media.hold.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className={SMALL} onClick={() => setOpen(true)}>
          {t("checklist.media.hold.hold")}
        </Button>
      )}
      {errorText !== null && (
        <p role="alert" className="break-words text-xs text-rose-700">
          {errorText}
        </p>
      )}
    </div>
  );
}
