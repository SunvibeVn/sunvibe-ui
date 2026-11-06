"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

function Lines({ title, lines }: { title: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

type SubmitConfirmDialogProps = {
  /** Terms not confirmed and warnings still open: neither blocks a submit (US-2 AC-2). */
  unconfirmed: readonly string[];
  warnings: readonly string[];
  /** A group has edits that were not saved: they stay out of the submitted record. */
  unsaved: boolean;
  pending: boolean;
  onClose(): void;
  onConfirm(): void;
};

/**
 * Asks once before a submit (survey-checklist submission spec 6.1, D3-1): what stays open, that the record and its
 * photos freeze, and that it is a site record, not a legal, safety or photo-permission check.
 */
export function SubmitConfirmDialog({ unconfirmed, warnings, unsaved, pending, onClose, onConfirm }: SubmitConfirmDialogProps) {
  const t = useTranslations("OwnerLeads");
  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("checklist.submit.dialog.title")}
      closeLabel={pending ? undefined : t("checklist.submit.dialog.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("checklist.submit.dialog.cancel")}
          </Button>
          <Button pending={pending} onClick={onConfirm}>
            {pending ? t("checklist.submit.submitting") : t("checklist.submit.dialog.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {unsaved && <Alert tone="error">{t("checklist.submit.dialog.unsaved")}</Alert>}
        <Lines title={t("checklist.submit.dialog.unconfirmed")} lines={unconfirmed} />
        <Lines title={t("checklist.submit.dialog.warnings")} lines={warnings} />
        <p className="text-sm font-medium text-slate-900">{t("checklist.submit.dialog.frozen")}</p>
        <p className="text-sm text-slate-700">{t("checklist.submit.dialog.site")}</p>
      </div>
    </Dialog>
  );
}
