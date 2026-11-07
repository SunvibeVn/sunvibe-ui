"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { deselectErrorText, mediaErrorText } from "../../lib/checklist/media-messages";
import { type PhotoCard, removalAction, removalNeedsCorrection } from "../../lib/checklist/media-panel-model";

import type { MediaUiError } from "../../lib/media-ui-error";
import type { ChecklistCorrectionInput } from "../../types";
import { useChecklistPage } from "./checklist-context";
import { CorrectionBox } from "./correction-box";
import { useChecklistMedia } from "./media-context";

const PAGE_HANDLED = new Set(["not-found", "forbidden", "read-only", "takeover-required", "surveyor-ineligible", "signed-out", "unavailable"]);

/**
 * Removal of a photo by the holder (survey-media spec 4.7, 6.2): a confirmation, or the W16 correction box when
 * someone else uploaded a committed photo (BR-12) or the server asks for one. A held photo is removed too; its file is
 * deleted after the hold ends (A-23). A carried photo only leaves this revision, under the same rule (survey-checklist
 * submission 4.6).
 */
export function PhotoRemoveDialog({ photo, onClose }: { photo: PhotoCard; onClose(): void }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const { userId, rules } = useChecklistPage();
  const item = media?.itemOf(photo.id) ?? null;
  const [correction, setCorrection] = useState<"none" | "asked" | "server">(
    item !== null && removalNeedsCorrection(item, userId) ? "asked" : "none",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MediaUiError | null>(null);
  const carried = removalAction(photo) === "deselect";

  const remove = async (input: ChecklistCorrectionInput | null) => {
    if (media === null || pending) return;
    setPending(true);
    setError(null);
    const outcome = await (carried ? media.deselect(photo.id, input) : media.remove(photo.id, input));
    setPending(false);
    if (outcome.kind === "done") {
      onClose();
      return;
    }
    if (outcome.error.kind === "correction-required") setCorrection("server");
    else if (PAGE_HANDLED.has(outcome.error.kind)) onClose();
    else setError(outcome.error);
  };

  const errorText = error === null ? null : carried ? deselectErrorText(error, t) : mediaErrorText(error, t);
  const text = carried
    ? t("checklist.media.carried.text", { from: photo.carriedFromChecklistNo ?? "" })
    : t(photo.badge === "held" ? "checklist.media.remove.heldText" : "checklist.media.remove.text");
  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t(carried ? "checklist.media.carried.title" : "checklist.media.remove.title", { no: photo.mediaNo })}
      closeLabel={pending ? undefined : t("checklist.media.remove.close")}
      footer={
        correction === "none" ? (
          <>
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              {t("checklist.media.remove.cancel")}
            </Button>
            <Button pending={pending} onClick={() => void remove(null)}>
              {t(carried ? "checklist.media.carried.remove" : "checklist.media.remove.confirm")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <p>{text}</p>
        {errorText !== null && (
          <div aria-live="polite">
            <Alert tone="error">{errorText}</Alert>
          </div>
        )}
        {correction !== "none" && (
          <>
            <p className="text-sm text-slate-700">{t(carried ? "checklist.media.carried.correction" : "checklist.media.remove.correction")}</p>
            <CorrectionBox
              reasons={[{ kind: "entered-by", unitKey: `media/${photo.id}`, name: photo.uploadedByName }]}
              server={correction === "server"}
              rules={rules}
              pending={pending}
              onSubmit={(input) => void remove(input)}
              onCancel={onClose}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
