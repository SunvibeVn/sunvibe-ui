"use client";

import { createContext, useCallback, useContext, useLayoutEffect } from "react";

import type { ApiResult } from "@/features/auth/client";

import { COMMAND_IDLE, type CommandState, commandOutcome, type IntakeMessage, runCommand } from "../lib/intake-command";
import type { IntakeViewer } from "../lib/intake-viewer";
import type { IntakeBlock } from "../types";

export { COMMAND_IDLE, type CommandState };

/** What the intake page offers to its steps and panels; only exists while a block of the signed-in user is loaded. */
export type IntakeController = {
  leadId: string;
  /** The lead's ward: a link must stay in it, so the search of the owner's properties starts there. */
  wardCode: string | null;
  block: IntakeBlock;
  viewer: IntakeViewer;
  /**
   * Raised when a command's own answer replaces the block: the forms start again from it. A read that only moved the
   * version leaves them alone, so a refusal keeps what was typed and the next submit sends the new version.
   */
  epoch: number;
  /** True while a command is on its way: the others are locked meanwhile. */
  busy: boolean;
  setBusy(source: string, busy: boolean): void;
  /** Reads the block and the lead's assignee again; the page keeps what it has when the read fails. */
  reload(): Promise<void>;
  /** Takes the block a command answered. */
  apply(block: IntakeBlock): void;
  /** The lead or the intake is gone for this user: nothing of it stays on screen. */
  leave(): void;
  /** Shows a message above the steps, where it outlives a step the read takes away; null clears it. */
  notify(message: IntakeMessage | null, tone?: "error" | "success"): void;
};

const IntakeContext = createContext<IntakeController | null>(null);

export const IntakeProvider = IntakeContext.Provider;

export function useIntake(): IntakeController {
  const controller = useContext(IntakeContext);
  if (controller === null) throw new Error("useIntake must be used inside IntakePage");
  return controller;
}

/** Runs one command of a form action: the page reads again, or leaves, as its answer calls for. */
export function useIntakeCommand() {
  const { reload, leave, notify } = useIntake();
  return useCallback(
    async <T,>(send: () => Promise<ApiResult<T>>, done: (data: T) => void | Promise<void>): Promise<CommandState> => {
      notify(null);
      const step = await runCommand({ send, reload });
      if (step.kind === "done") {
        await done(step.data);
        return COMMAND_IDLE;
      }
      if (step.kind === "leave") leave();
      const { state, notice } = commandOutcome(step);
      if (notice !== null) notify(notice);
      return state;
    },
    [reload, leave, notify],
  );
}

/**
 * Holds the page's lock while a form action runs. Taken in a layout effect on `pending`, not inside the action: a state
 * update made inside an action commits only after the action finished.
 */
export function useIntakeLock(source: string, pending: boolean): void {
  const { setBusy } = useIntake();
  useLayoutEffect(() => {
    setBusy(source, pending);
  }, [source, pending, setBusy]);
  useLayoutEffect(() => () => setBusy(source, false), [source, setBusy]);
}
