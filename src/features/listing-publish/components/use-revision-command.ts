import { useRef, useState } from "react";

import type { RevisionCommand, RevisionCommandOutcome, RevisionRun } from "../lib/revision-model";
import type { RevisionAnswer, RevisionProblem } from "../lib/revision-text";

/** The last refused command of the panel: its answer's sentence and, for the 422, its entries. */
export type RevisionRefusal = { answer: RevisionAnswer; problems: RevisionProblem[] };

/**
 * One command of the revision panel at a time (spec section 6): `run` sends nothing while another command runs, marks
 * the running one in `busy` (its button reads its pending text, every other is disabled) and keeps the last refusal for
 * the panel's alert, cleared when the next command starts. `onOutcome` hears every outcome.
 */
export function useRevisionCommand(onOutcome?: (command: RevisionCommand, outcome: RevisionCommandOutcome) => void) {
  const [busy, setBusy] = useState<RevisionCommand | null>(null);
  const [refusal, setRefusal] = useState<RevisionRefusal | null>(null);
  /** Set when a command starts, cleared when it ends: a click meanwhile is not even queued. */
  const sending = useRef(false);

  const run: RevisionRun = async (command, send) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(command);
    setRefusal(null);
    try {
      const outcome = await send();
      if (outcome.kind === "refused") setRefusal({ answer: outcome.answer, problems: outcome.problems });
      onOutcome?.(command, outcome);
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  return { busy, refusal, run };
}
