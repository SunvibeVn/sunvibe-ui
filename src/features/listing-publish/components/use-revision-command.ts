import { useEffect, useRef, useState } from "react";

import type { RevisionCommand, RevisionCommandOutcome, RevisionRun } from "../lib/revision-model";
import type { RevisionAnswer, RevisionProblem } from "../lib/revision-text";

/** The last refused command of the panel: its answer's sentence and, for the 422, its entries. */
export type RevisionRefusal = { answer: RevisionAnswer; problems: RevisionProblem[] };

type CommandOptions = {
  /**
   * The reads a command asked for (the listing and its open revision) have not all answered: the screen still holds
   * the data version the command was sent with, which the next command would send back to a refusal (spec section 6,
   * "After every command"). The panel derives it from its reads.
   */
  rereading?: boolean;
  /** Hears every outcome. */
  onOutcome?: (command: RevisionCommand, outcome: RevisionCommandOutcome) => void;
};

/**
 * One command of the revision panel at a time (spec section 6, E06S2-P11): `busy` names the command from its click
 * until its answer and, when it asked to read again, until those reads answered (`rereading`); meanwhile its button
 * reads its pending text, every other is disabled, and `run` sends nothing. It keeps the last refusal for the panel's
 * alert, cleared when the next command starts.
 */
export function useRevisionCommand({ rereading = false, onOutcome }: CommandOptions = {}) {
  const [sent, setSent] = useState<{ command: RevisionCommand; answered: boolean } | null>(null);
  const [refusal, setRefusal] = useState<RevisionRefusal | null>(null);
  const busy = sent !== null && (!sent.answered || rereading) ? sent.command : null;
  /** Set when a command starts, cleared once `busy` is: a click meanwhile is not even queued. */
  const sending = useRef(false);

  useEffect(() => {
    if (busy === null) sending.current = false;
  }, [busy]);

  const run: RevisionRun = async (command, send) => {
    if (sending.current) return;
    sending.current = true;
    setSent({ command, answered: false });
    setRefusal(null);
    try {
      const outcome = await send();
      if (outcome.kind === "refused") setRefusal({ answer: outcome.answer, problems: outcome.problems });
      onOutcome?.(command, outcome);
    } finally {
      setSent({ command, answered: true });
    }
  };

  return { busy, refusal, run };
}
