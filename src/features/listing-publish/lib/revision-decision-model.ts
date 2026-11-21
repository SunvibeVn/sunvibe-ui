import type { ApiResult } from "@/features/auth/client";

import type { ListingDetail, ListingRevisionDecision } from "../types";

import { revisionStatusKey, type RevisionStatusKey } from "./listing-text";
import { changeReasonKey, rejectionGroupKey } from "./review-text";
import type { ListingKey } from "./revision-text";

type DecidedStatus = "NEEDS_CHANGES" | "REJECTED" | "APPROVED";

const DECIDED: readonly string[] = ["NEEDS_CHANGES", "REJECTED", "APPROVED"] satisfies DecidedStatus[];

/**
 * What the listing page's "Latest review" section takes from the listing read (spec section 6, E06S4-P12): the newest
 * listed revision that a reviewer decided, the listing's data version a copy sends back, the open revision and whether
 * the viewer is the assigned Sale. Null when no listed revision was decided: the section is not mounted.
 */
export type RevisionDecisionInput = {
  revisionNo: number;
  status: DecidedStatus;
  dataVersion: number;
  openRevisionNo: number | null;
  viewerIsAssignedSale: boolean;
};

/**
 * The section after its read. `none`: the one 404 (no decision, or out of scope) or a session answer, which show
 * nothing; `ready`: the decision as shown, its reasons or group and its note as text, and whether the copy is offered.
 */
export type RevisionDecisionModel =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none" }
  | {
      kind: "ready";
      revisionNo: number;
      outcomeKey: RevisionStatusKey;
      decidedAt: string;
      reasonKeys: ListingKey[];
      groupKey: ListingKey | null;
      note: string | null;
      /** "Copy into a new draft": a return, for the assigned Sale, while no revision is open (E06S4-D14, D17). */
      mayCopy: boolean;
      /** A rejection cannot be copied: the section says so. */
      rejected: boolean;
    };

/** The section's input from the listing read: the newest decided revision whether or not a revision is open (E06S4-D17). */
export function revisionDecisionInput(detail: ListingDetail): RevisionDecisionInput | null {
  let newest: ListingDetail["revisions"][number] | null = null;
  for (const revision of detail.revisions) {
    if (DECIDED.includes(revision.status) && (newest === null || revision.revisionNo > newest.revisionNo)) newest = revision;
  }
  if (newest === null) return null;
  return {
    revisionNo: newest.revisionNo,
    status: newest.status as DecidedStatus,
    dataVersion: detail.dataVersion,
    openRevisionNo: detail.openRevisionNo,
    viewerIsAssignedSale: detail.viewerIsAssignedSale,
  };
}

export function revisionDecisionModel(result: ApiResult<ListingRevisionDecision> | null, input: RevisionDecisionInput): RevisionDecisionModel {
  if (result === null) return { kind: "loading" };
  if (result.ok) {
    const decision = result.data;
    return {
      kind: "ready",
      revisionNo: input.revisionNo,
      outcomeKey: revisionStatusKey(decision.outcome),
      decidedAt: decision.decidedAt,
      reasonKeys: decision.changeReasons.map(changeReasonKey),
      groupKey: decision.rejectionGroup === null ? null : rejectionGroupKey(decision.rejectionGroup),
      note: decision.note,
      mayCopy: decision.outcome === "NEEDS_CHANGES" && input.viewerIsAssignedSale && input.openRevisionNo === null,
      rejected: decision.outcome === "REJECTED",
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "none" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "none" } : { kind: "error" };
  }
}
