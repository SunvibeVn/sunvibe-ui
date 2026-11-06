import type { ApiResult } from "@/features/auth/client";

import { toIntakeUiError } from "../services/intake-api";
import type { IntakeBlock } from "../types";

/** What a read of the block leaves on screen. */
export type SectionView =
  | { kind: "ready"; block: IntakeBlock }
  | { kind: "error"; correlationId?: string }
  /** Nothing of the intake shows. */
  | { kind: "hidden" };

const HIDDEN = new Set(["not-found", "forbidden", "signed-out", "unavailable"]);

/**
 * A 404 hides the section (A-11): the switch is off or the lead is not visible, and the page says nothing about which. A
 * role the block refuses hides it too, and the session screens answer the session states. Any other failure offers a retry.
 */
export function sectionAfter(result: ApiResult<IntakeBlock>): SectionView {
  if (result.ok) return { kind: "ready", block: result.data };
  const error = toIntakeUiError(result);
  if (error !== null && HIDDEN.has(error.kind)) return { kind: "hidden" };
  return error?.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: error.correlationId };
}
