"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import type { CommandMessage } from "../lib/command-flow";
import { isClosedLeadStatus, isLeadStatus } from "../types";

import { AssignDialog } from "./assign-dialog";
import { CommandMessageView } from "./command-message";
import { useLeadDetail } from "./lead-detail-context";
import { StatusDialog } from "./status-dialog";

/** The open dialog, with the lead status it was opened for and its instance number. */
type OpenDialog = { kind: "status" | "assign"; status: string | undefined; no: number };

/**
 * The action buttons of the detail header (BR-1): "Đổi trạng thái" on open leads, "Giao / Giao lại" for `ALL` viewers
 * on open leads; a closed lead shows neither. Holds the open dialog and the last command message, so the message stays
 * visible when the dialog closes. A dialog closes when the lead reloads with another status (someone else changed it,
 * or our own change went through) and when the route is hidden (Activity).
 *
 * One command at a time (CR-2): while a command is on its way, even after its dialog closed, both buttons are locked.
 * Each dialog gets an instance number; a dialog that is no longer the current one (the route was hidden since) cannot
 * close a newer dialog, set the message or unlock the buttons of another command.
 */
export function LeadActionsSlot() {
  const t = useTranslations("OwnerLeads");
  const { lead, viewer, version } = useLeadDetail();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [message, setMessage] = useState<CommandMessage | null>(null);
  /** Instance number of the dialog whose command is on its way; null when none. */
  const [busyNo, setBusyNo] = useState<number | null>(null);
  /** Number of the current dialog instance; bumped on every open and when the route is hidden. Read in callbacks. */
  const current = useRef(0);

  // Adjusting state while rendering (React "storing information from previous renders"): the dialog was opened for
  // another status, so its targets or its sense are gone. Its message, if any, stays below the buttons.
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

  const closed = isClosedLeadStatus(lead.status);
  const open = isLeadStatus(lead.status) && !closed;
  const canAssign = open && viewer.access === "ALL";
  const ready = version !== undefined && busyNo === null;

  const show = (kind: OpenDialog["kind"]) => {
    if (busyNo !== null) return;
    current.current += 1;
    setMessage(null);
    setDialog({ kind, status: lead.status, no: current.current });
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
    onBusy(busy: boolean) {
      // Only the instance that locked the buttons unlocks them.
      setBusyNo((locked) => (busy ? no : locked === no ? null : locked));
    },
  });

  return (
    <>
      {(open || canAssign) && (
        <div className="flex flex-wrap gap-2">
          {open && (
            <Button variant="secondary" className="px-4 py-2" disabled={!ready} onClick={() => show("status")}>
              {t("detail.changeStatus")}
            </Button>
          )}
          {canAssign && (
            <Button variant="secondary" className="px-4 py-2" disabled={!ready} onClick={() => show("assign")}>
              {lead.assignedUserId ? t("detail.reassign") : t("detail.assign")}
            </Button>
          )}
        </div>
      )}

      {dialog === null && message !== null && (
        <div className="space-y-2" aria-live="polite">
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

      {dialog?.kind === "status" && (
        <StatusDialog key={dialog.no} message={message} onClose={close} {...callbacksOf(dialog.no)} />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog key={dialog.no} message={message} onClose={close} {...callbacksOf(dialog.no)} />
      )}
    </>
  );
}
