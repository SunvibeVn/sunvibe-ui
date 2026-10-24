"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { checkOverlaps, type SurveyOverlap } from "@/features/surveys";
import { localInputToInstant } from "@/lib/format/vietnam-time";

import { durationOf, minuteInstant } from "../../schemas/survey/survey-text";

import { OverlapList } from "./overlap-list";

/** Wait after the last keystroke before asking: one pre-check per settled time, not per digit. */
const DEBOUNCE_MS = 400;

type Check =
  | { state: "idle" }
  | { state: "checking"; key: string }
  | { state: "done"; key: string; overlaps: NonNullable<SurveyOverlap>[] }
  | { state: "failed"; key: string };

type OverlapWarningProps = {
  leadId: string;
  /** `datetime-local` value, Vietnam time. */
  start: string;
  /** Minutes, as the select's value. */
  duration: string;
  /** On edit: the appointment itself is left out. */
  excludeAppointmentId?: string;
  /** False when the time did not change (edit), so nothing is asked. */
  enabled?: boolean;
};

/**
 * The overlap pre-check of the book and edit dialogs (US-1 AC-4, A-10): once start and duration are valid it lists the
 * surveyor's other appointments at that time (code and time only). A warning: saving stays possible.
 */
export function OverlapWarning({ leadId, start, duration, excludeAppointmentId, enabled = true }: OverlapWarningProps) {
  const t = useTranslations("OwnerLeads");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  const startAt = minuteInstant(start, localInputToInstant);
  const minutes = durationOf(duration);
  const key =
    enabled && typeof startAt === "number" && minutes !== null ? `${new Date(startAt).toISOString()}|${minutes}` : null;

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const [iso, length] = key.split("|");
    const timer = setTimeout(() => {
      setCheck({ state: "checking", key });
      const query = { startAt: iso, durationMinutes: Number(length), ...(excludeAppointmentId ? { excludeAppointmentId } : {}) };
      void checkOverlaps(leadId, query).then((result) => {
        if (cancelled) return;
        setCheck(
          result.ok
            ? {
                state: "done",
                key,
                overlaps: (result.data?.overlaps ?? []).filter((item): item is NonNullable<SurveyOverlap> => item !== null),
              }
            : { state: "failed", key },
        );
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, leadId, excludeAppointmentId]);

  // Only the answer for the time on screen counts.
  if (key === null || check.state === "idle" || check.key !== key) return null;
  if (check.state === "checking") {
    return (
      <p role="status" className="text-xs text-slate-500">
        {t("survey.overlap.checking")}
      </p>
    );
  }
  if (check.state === "failed") {
    return (
      <p role="status" className="text-xs text-amber-700">
        {t("survey.overlap.failed")}
      </p>
    );
  }
  return <OverlapList overlaps={check.overlaps} />;
}
