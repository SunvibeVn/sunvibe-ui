import type { RentalScope } from "./group-input";

/**
 * The warning a G1 scope switch shows before saving (survey-checklist spec 6.4, A-12): to WHOLE it clears the shared
 * kitchen and bathroom and the per-space charges and fees; to PARTS the rent and available-from date taken from the
 * owner's form. A first choice warns nothing.
 */
export function scopeSwitchWarning(from: RentalScope | null, to: RentalScope | null): "toWhole" | "toParts" | null {
  if (from === null || to === null || from === to) return null;
  return to === "WHOLE" ? "toWhole" : "toParts";
}
