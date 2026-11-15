import type { ApiResult } from "@/features/auth/client";

import type { BrokerageEligibility } from "../types";

import { type EligibilityKey, reasonText } from "./reason-text";

/** One unit of the basis as the section lists it; `unitCode` is null when the unit row is missing. */
export type EligibilityRow = { unitId: string; unitCode: string | null; eligible: boolean; reasonKeys: EligibilityKey[] };

/** What a read of the eligibility leaves on screen. */
export type EligibilityModel =
  /** Nothing of the eligibility shows. */
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error"; correlationId?: string }
  /** `assignedOnly`: the viewer is not the assigned Sale, who alone drafts an agreement (brokerage-agreement BR-16). */
  | { kind: "ready"; rows: EligibilityRow[]; assignedOnly: boolean };

/** HTTP statuses that hide the section: the lead is not visible (404) or the role may not read it (403). */
const HIDDEN_STATUSES = new Set([403, 404]);

/**
 * A lead with no completed intake (`basisState` NONE) hides the section, and so do a 404 (the page says nothing about
 * why), a 403 and the session states, which the session screens answer. Any other failure offers a retry. Failures are
 * read by kind and status, never by message.
 */
export function eligibilityAfter(result: ApiResult<BrokerageEligibility>): EligibilityModel {
  if (result.ok) {
    const { basisState, viewerIsAssignedSale, units } = result.data;
    if (basisState === undefined || basisState === "NONE") return { kind: "hidden" };
    const rows = (units ?? []).map(
      (unit): EligibilityRow => ({
        unitId: unit.unitId ?? "",
        unitCode: unit.unitCode ?? null,
        eligible: unit.eligible === true,
        reasonKeys: (unit.reasonGroups ?? []).map(reasonText),
      }),
    );
    return { kind: "ready", rows, assignedOnly: viewerIsAssignedSale !== true };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      if (HIDDEN_STATUSES.has(result.status)) return { kind: "hidden" };
      return result.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: result.correlationId };
  }
}
