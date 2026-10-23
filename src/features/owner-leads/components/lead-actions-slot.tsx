"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import type { CommandMessage } from "../lib/command-flow";
import { isClosedLeadStatus, isLeadStatus } from "../types";

import { AssignDialog } from "./assign-dialog";
import { CommandMessageView } from "./command-message";
import { useLeadDetail } from "./lead-detail-context";

/** The open assign dialog, with the lead status it was opened for and its instance number. */
type OpenDialog = { status: string | undefined; no: number };

/**
 * The assign button of the lead block (BR-1): "Assign / Reassign" for `ALL` viewers on open leads; a closed lead has
 * none. The status changes in the history (owner 2026-10-23, D-2). Holds the open dialog and the last command message,
 * so the message stays visible when the dialog closes. The dialog closes when the lead reloads with another status
 * (someone else changed it) and when the route is hidden (Activity).
 *
 * One command at a time on the page (CR-2): while a command is on its way, here or in the history, the button is
 * locked. Each dialog gets an instance number; a dialog that is no longer the current one (the route was hidden since)
 * cannot close a newer dialog, set the message or unlock the button for another command.
 */
export function LeadActionsSlot() {
  const t = useTranslations("OwnerLeads");
  const { lead, viewer, version, busy, setBusy } = useLeadDetail();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [message, setMessage] = useState<CommandMessage | null>(null);
  /** Instance number of the dialog whose command is on its way; null when none. */
  const [busyNo, setBusyNo] = useState<number | null>(null);
  /** Number of the current dialog instance; bumped on every open and when the route is hidden. Read in callbacks. */
  const current = useRef(0);

  // Adjusting state while rendering (React "storing information from previous renders"): the dialog was opened for
  // another status, so its sense is gone. Its message, if any, stays below the button.
  if (dialog !== null && dialog.status !== lead.status) setDialog(null);

  // Activity hides the route without unmounting it: close the dialog (and drop the message) before it is hidden, so it
  // does not come back open over a reloaded page (Next "preserving UI state"). The closed dialog is no longer current:
  // a late answer of its command does not show a message on return.
  useLayoutEffect(
    () => () => {
      current.current += 1;
      setDialog(null);
      setMessage(null);
    },
    [],
  );

  // The page-wide lock follows the command of this slot.
  useEffect(() => {
    setBusy("assign", busyNo !== null);
  }, [busyNo, setBusy]);

  const open = isLeadStatus(lead.status) && !isClosedLeadStatus(lead.status);
  const canAssign = open && viewer.access === "ALL";
  const ready = version !== undefined && busyNo === null && !busy;

  const show = () => {
    if (busyNo !== null || busy) return;
    current.current += 1;
    setMessage(null);
    setDialog({ status: lead.status, no: current.current });
  };
  // Dialog contract: every close request closes; a pending call goes on and reports through `message`.
  const close = () => setDialog(null);

  /** The callbacks of dialog instance `no`: ignored once it is not the current instance. */
  const callbacksOf = (no: number) => ({
    onMessage(next: CommandMessage | null) {
      if (current.current === no) setMessage(next);
    },
    onDone(next: CommandMessage | null) {
      if (current.current !== no) return;
      setDialog(null);
      setMessage(next);
    },
    onBusy(isBusy: boolean) {
      // Only the instance that locked the button unlocks it.
      setBusyNo((locked) => (isBusy ? no : locked === no ? null : locked));
    },
  });

  return (
    <>
      {canAssign && (
        <Button className="px-5! py-2!" disabled={!ready} onClick={show}>
          {lead.assignedUserId ? t("detail.reassign") : t("detail.assign")}
        </Button>
      )}

      {dialog === null && message !== null && (
        <div className="basis-full space-y-2" aria-live="polite">
          <CommandMessageView message={message} />
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-sm font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            {t("notice.dismiss")}
          </button>
        </div>
      )}

      {dialog !== null && (
        <AssignDialog key={dialog.no} message={message} onClose={close} {...callbacksOf(dialog.no)} />
      )}
    </>
  );
}
