"use client";

import { useLayoutEffect } from "react";

import { useLeadDetail } from "../lead-detail-context";

/**
 * Holds the page's one command lock while a survey dialog's action runs (CR-2, Review Focus 5). Taken in a layout
 * effect on `pending`, not inside the action: a state update made inside an action commits only after the action
 * finished. Released when the dialog unmounts.
 */
export function useSurveyLock(pending: boolean): void {
  const { setBusy } = useLeadDetail();
  useLayoutEffect(() => {
    setBusy("survey", pending);
  }, [pending, setBusy]);
  useLayoutEffect(() => () => setBusy("survey", false), [setBusy]);
}
