"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SurveyCommandResult, SurveyOverlap } from "@/features/surveys";

import {
  bookingBlockKey,
  dialogAppointment,
  earlierAppointments,
  type Place,
  scheduledAppointment,
} from "../../lib/survey/appointment-view";
import { isClosedLeadStatus } from "../../types";
import { useLeadDetail } from "../lead-detail-context";

import { type AppointmentAction, AppointmentCard } from "./appointment-card";
import { AppointmentHistory } from "./appointment-history";
import { ChecklistAction } from "./checklist-action";
import { BookDialog } from "./book-dialog";
import { CancelDialog } from "./cancel-dialog";
import { ChangeDialog } from "./change-dialog";
import { ConfirmationDialog } from "./confirmation-dialog";
import { OverlapList } from "./overlap-list";
import { RequirementChanges } from "./requirement-changes";
import { ResumeDialog } from "./resume-dialog";
import { VisitDialog } from "./visit-dialog";

/** The open dialog; an appointment's dialog names the appointment it was opened for. */
type OpenDialog = { dialog: "book" | "resume" } | { dialog: AppointmentAction; appointmentId: string } | null;

const NO_ITEMS: readonly never[] = [];

/**
 * The Survey section of the lead detail (spec 6.1, A-20), between the 2x2 grid and History, anchor `#survey`: the top
 * action (book, re-survey or the reason booking is blocked; resume; the checklist action of the current visit), the scheduled appointment with its buttons, the
 * earlier appointments collapsed and the requirement changes. Loading, empty and error states. Every button waits
 * while any command of the page runs (CR-2).
 */
export function SurveySection() {
  const t = useTranslations("OwnerLeads");
  const { lead, survey, reloadSurvey, busy } = useLeadDetail();
  const [open, setOpen] = useState<OpenDialog>(null);
  /** The last save: "Saved." and the overlaps of its answer (A-10), until the next action. */
  const [saved, setSaved] = useState<{ overlaps: NonNullable<SurveyOverlap>[] } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const leadPlace: Place = {
    addressText: lead.addressDetail ?? "",
    wardCode: lead.wardCode ?? "",
    latitude: typeof lead.latitude === "number" && typeof lead.longitude === "number" ? lead.latitude : null,
    longitude: typeof lead.latitude === "number" && typeof lead.longitude === "number" ? lead.longitude : null,
  };

  const close = () => setOpen(null);
  const done = (result?: SurveyCommandResult) => {
    setOpen(null);
    const overlaps = (result?.overlaps ?? []).filter((item): item is NonNullable<SurveyOverlap> => item !== null);
    setSaved({ overlaps });
  };
  // An appointment's dialog whose appointment was cancelled, visited or replaced meanwhile (seen after a reload).
  const opened = open !== null && "appointmentId" in open ? open : null;
  const gone =
    opened !== null && survey.state === "ready" && dialogAppointment(survey.block, opened.appointmentId) === null;
  // After a save, or when such a dialog closes itself, the dialog gives focus back to its opener; when that button is
  // gone (booked, cancelled, visited), focus lands on the section title instead of the page body. Runs after the
  // dialog's own cleanup.
  useEffect(() => {
    if ((saved !== null || gone) && (document.activeElement === null || document.activeElement === document.body)) {
      titleRef.current?.focus();
    }
  }, [saved, gone]);
  const start = (next: Exclude<OpenDialog, null>) => {
    setSaved(null);
    setOpen(next);
  };

  let body;
  if (survey.state === "loading") {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t("survey.loading")}</span>
        <div aria-hidden className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  } else if (survey.state === "error") {
    body = (
      <div className="space-y-3">
        <Alert tone="error">
          <p>{survey.error.kind === "forbidden" ? t("survey.errors.forbidden") : t("survey.loadFailed")}</p>
          {survey.error.correlationId !== undefined && (
            <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: survey.error.correlationId })}</p>
          )}
        </Alert>
        <Button variant="secondary" onClick={() => void reloadSurvey()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  } else {
    const block = survey.block;
    const scheduled = scheduledAppointment(block);
    const earlier = earlierAppointments(block);
    const blockedBy = bookingBlockKey(block);
    const kind = block.booking?.kind ?? "FIRST";
    const changes = lead.intentChanges ?? NO_ITEMS;
    const followsVisitNo =
      scheduled?.previousVisitId == null
        ? undefined
        : (earlier.find((entry) => entry.id === scheduled.previousVisitId)?.appointmentNo ?? undefined);
    // An appointment's dialog stays open only on the appointment it was opened for: after a conflict reload that shows
    // it cancelled, visited or replaced, the dialog closes with a note instead of sending to another appointment.
    const target = opened === null ? null : dialogAppointment(block, opened.appointmentId);
    // A closed lead offers nothing; ALREADY_SCHEDULED is shown by the appointment itself.
    const showBlocked = blockedBy !== null && blockedBy !== "ALREADY_SCHEDULED" && !isClosedLeadStatus(lead.status);

    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {blockedBy === null && (
            <Button disabled={busy} onClick={() => start({ dialog: "book" })}>
              {kind === "RESURVEY" ? t("survey.bookResurvey") : t("survey.book")}
            </Button>
          )}
          {block.resumeAllowed === true && (
            <Button variant="secondary" disabled={busy} onClick={() => start({ dialog: "resume" })}>
              {t("survey.resume")}
            </Button>
          )}
          {showBlocked && <p className="text-sm text-slate-600">{t(`survey.blocked.${blockedBy}`)}</p>}
          <ChecklistAction block={block} />
        </div>

        {gone && <Alert>{t("survey.appointmentChanged")}</Alert>}
        {saved !== null && (
          <div className="space-y-2">
            <Alert tone="success">{t("survey.saved")}</Alert>
            <OverlapList overlaps={saved.overlaps} />
          </div>
        )}

        {scheduled !== undefined && (
          <AppointmentCard
            appointment={scheduled}
            followsVisitNo={followsVisitNo}
            busy={busy}
            onAction={(dialog) => start({ dialog, appointmentId: scheduled.id ?? "" })}
          />
        )}
        {scheduled === undefined && earlier.length === 0 && (
          <p className="text-sm text-slate-600">{t("survey.empty")}</p>
        )}
        <AppointmentHistory appointments={earlier} resumptions={block.resumptions ?? NO_ITEMS} />
        <RequirementChanges changes={changes} />

        {open?.dialog === "book" && <BookDialog kind={kind} leadPlace={leadPlace} onClose={close} onSaved={done} />}
        {open?.dialog === "resume" && <ResumeDialog onClose={close} onSaved={() => done()} />}
        {target !== null && opened?.dialog === "edit" && (
          <ChangeDialog appointment={target} onClose={close} onSaved={() => done()} />
        )}
        {target !== null && (opened?.dialog === "confirm" || opened?.dialog === "unconfirm") && (
          <ConfirmationDialog
            appointment={target}
            confirm={opened.dialog === "confirm"}
            onClose={close}
            onSaved={() => done()}
          />
        )}
        {target !== null && opened?.dialog === "cancel" && (
          <CancelDialog appointment={target} onClose={close} onSaved={() => done()} />
        )}
        {target !== null && opened?.dialog === "visit" && (
          <VisitDialog appointment={target} onClose={close} onSaved={() => done()} />
        )}
      </div>
    );
  }

  return (
    <section
      id="survey"
      aria-labelledby="survey-title"
      className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h2
        id="survey-title"
        ref={titleRef}
        tabIndex={-1}
        className="text-base font-semibold text-slate-900 focus:outline-none"
      >
        {t("survey.title")}
      </h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}
