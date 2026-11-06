import type { OwnerLeadsKey } from "@/features/lead-shared";
import type { ChecklistReadiness, ChecklistUiError, ChecklistView } from "@/features/surveys";

// The submit panel of the checklist page (survey-checklist submission spec 6.1, U-1, 4.4) as pure functions: what it
// shows, what the confirm dialog lists and what a refused submit does.

export type SubmitPanelState =
  /** A viewer who cannot edit, or a revision that left DRAFT: the read-only notice says why. */
  | { kind: "hidden" }
  | { kind: "available" }
  /** The first failing gate takes the place of the button. */
  | { kind: "unavailable"; text: OwnerLeadsKey };

type GateReason = NonNullable<ChecklistReadiness["submissionUnavailableReason"]>;

/** The texts of `readiness.submissionUnavailableReason` (spec 4.4), by the contract's enum: a new value fails the compiler. */
const GATE_TEXT: Readonly<Record<GateReason, OwnerLeadsKey>> = {
  SUBMISSION_NOT_AVAILABLE: "checklist.submit.gate.SUBMISSION_NOT_AVAILABLE",
  EVIDENCE_NOT_AVAILABLE: "checklist.submit.gate.EVIDENCE_NOT_AVAILABLE",
  APPOINTMENT_SCHEDULED: "checklist.submit.gate.APPOINTMENT_SCHEDULED",
  MISSING_ITEMS: "checklist.submit.gate.MISSING_ITEMS",
  PHOTOS_NOT_FINISHED: "checklist.submit.gate.PHOTOS_NOT_FINISHED",
  PHOTO_LIMIT: "checklist.submit.gate.PHOTO_LIMIT",
  PHOTO_UNAVAILABLE: "checklist.submit.gate.PHOTO_UNAVAILABLE",
};

const isGateReason = (reason: string): reason is GateReason => Object.hasOwn(GATE_TEXT, reason);

/** The text of a gate or an unavailable reason; a general one for a value this UI does not know (a newer server). */
export function gateTextKey(reason: string | null | undefined): OwnerLeadsKey {
  return typeof reason === "string" && isGateReason(reason) ? GATE_TEXT[reason] : "checklist.submit.gate.UNKNOWN";
}

/** The panel of an editable draft: the button when the read allows a submit, else the first failing gate (U-1). */
export function submitPanelState(view: ChecklistView): SubmitPanelState {
  if (view.status !== "DRAFT" || view.editable !== true) return { kind: "hidden" };
  if (view.readiness?.submissionAvailable === true) return { kind: "available" };
  return { kind: "unavailable", text: gateTextKey(view.readiness?.submissionUnavailableReason) };
}

/** One command at a time: `run` answers null without starting the task while an earlier one has not settled. */
export function createInFlightGuard() {
  let running = false;
  return {
    async run<T>(task: () => Promise<T>): Promise<T | null> {
      if (running) return null;
      running = true;
      try {
        return await task();
      } finally {
        running = false;
      }
    },
  };
}

export type SubmitFailureStep =
  /** 404, session, 403, read-only, takeover, ineligible assignee: the page answers (`fail`). */
  | { kind: "page" }
  /** The panel says why; `reload`: the read says what is true now. */
  | { kind: "message"; texts: OwnerLeadsKey[]; reload: boolean; correlationId?: string };

/**
 * What a refused submit does (spec 7.3). The text comes from the failing fields, not from the read: `readiness` may name
 * MISSING_ITEMS where a pending photo is the only cover of a pair (handoff 6). A failed answer may be sent again: a
 * repeat by the same caller answers 200 (A-4).
 */
export function submitFailureStep(error: ChecklistUiError): SubmitFailureStep {
  const support = error.correlationId === undefined ? {} : { correlationId: error.correlationId };
  const message = (texts: OwnerLeadsKey[], reload: boolean): SubmitFailureStep => ({ kind: "message", texts, reload, ...support });
  switch (error.kind) {
    case "not-ready": {
      const gates = error.gates ?? [];
      return message(gates.length > 0 ? gates.map(gateTextKey) : [gateTextKey(undefined)], true);
    }
    case "submission-not-available":
      return message([gateTextKey("SUBMISSION_NOT_AVAILABLE")], true);
    case "stale":
      return message(["checklist.submit.errors.stale"], true);
    case "not-found":
    case "signed-out":
    case "unavailable":
    case "forbidden":
    case "read-only":
    case "takeover-required":
    case "surveyor-ineligible":
      return { kind: "page" };
    default:
      return message(["checklist.submit.errors.failed"], false);
  }
}
