import type { ApiResult } from "@/features/auth/client";

import type { BrokerageEligibility } from "../types";

import { type EligibilityKey, reasonText } from "./reason-text";

/**
 * One unit of the basis as the section lists it; `unitCode` is null when the unit row is missing. `agreementInProgress`:
 * the unit has an unfinished agreement, from any lead; `agreementId` is set only when that agreement rests on this lead
 * (brokerage-agreement S2-D11). `canDraft`: the viewer is the assigned Sale and the unit is eligible and free
 * (brokerage-agreement BR-16); a hint only, the server decides.
 */
export type EligibilityRow = {
  unitId: string;
  unitCode: string | null;
  eligible: boolean;
  reasonKeys: EligibilityKey[];
  agreementInProgress: boolean;
  agreementId: string | null;
  canDraft: boolean;
};

/** What a read of the eligibility leaves on screen. */
export type EligibilityModel =
  /** Nothing of the eligibility shows. */
  | { kind: "hidden" }
  /** The lead has no completed intake (brokerage-agreement E-1, PLAN5-D2): the region says so instead of vanishing. */
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "error"; correlationId?: string }
  /** `assignedOnly`: the viewer is not the assigned Sale, who alone drafts an agreement (brokerage-agreement BR-16). */
  | { kind: "ready"; rows: EligibilityRow[]; assignedOnly: boolean };

/** HTTP statuses that hide the section: the lead is not visible (404) or the role may not read it (403). */
const HIDDEN_STATUSES = new Set([403, 404]);

/**
 * A lead with no completed intake (`basisState` NONE) has its own state (brokerage-agreement E-1, S3-D19). An answer
 * without `basisState` hides the section, and so do a 404 (the page says nothing about why), a 403 and the session
 * states, which the session screens answer. Any other failure offers a retry. Failures are read by kind and status,
 * never by message.
 */
export function eligibilityAfter(result: ApiResult<BrokerageEligibility>): EligibilityModel {
  if (result.ok) {
    const { basisState, viewerIsAssignedSale, units } = result.data;
    if (basisState === undefined) return { kind: "hidden" };
    if (basisState === "NONE") return { kind: "none" };
    const rows = (units ?? []).map((unit): EligibilityRow => {
      const eligible = unit.eligible === true;
      const agreementInProgress = unit.unfinishedAgreement === true;
      return {
        unitId: unit.unitId ?? "",
        unitCode: unit.unitCode ?? null,
        eligible,
        reasonKeys: (unit.reasonGroups ?? []).map(reasonText),
        agreementInProgress,
        agreementId: unit.agreementId ?? null,
        canDraft: eligible && !agreementInProgress && viewerIsAssignedSale === true,
      };
    });
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
