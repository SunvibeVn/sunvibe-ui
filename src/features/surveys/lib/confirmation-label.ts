import type { ConfirmationCause, SurveyConfirmation } from "../types";

/** Why an appointment that was confirmed once needs a new confirmation (spec 6.6). */
export type ReconfirmationCause = Exclude<ConfirmationCause, "NEW">;

export type ConfirmationLabel =
  | { key: "confirmed" }
  | { key: "notConfirmed" }
  | { key: "needsReconfirmation"; causeKey?: ReconfirmationCause };

const CAUSES: readonly ReconfirmationCause[] = ["TIME_CHANGED", "LOCATION_CHANGED", "REASSIGNED", "USER"];

/**
 * The confirmation label of an appointment (US-1 AC-3, AC-5, spec A-28): "Owner confirmed" only for a CONFIRMED state;
 * "Needs reconfirmation" with its cause once it was confirmed before; else "Not confirmed by the owner". Anything
 * missing or unknown never reads as agreed.
 */
export function confirmationLabel(
  confirmation: Pick<NonNullable<SurveyConfirmation>, "state" | "cause" | "everConfirmed"> | null | undefined,
): ConfirmationLabel {
  if (confirmation?.state === "CONFIRMED") return { key: "confirmed" };
  if (confirmation?.everConfirmed !== true) return { key: "notConfirmed" };
  const cause = confirmation.cause;
  return cause !== null && cause !== undefined && (CAUSES as readonly string[]).includes(cause)
    ? { key: "needsReconfirmation", causeKey: cause as ReconfirmationCause }
    : { key: "needsReconfirmation" };
}
