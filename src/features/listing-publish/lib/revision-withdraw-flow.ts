import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { commandOutcome, type RevisionCommandOutcome } from "./revision-model";

export type RevisionWithdrawFlowDeps = {
  withdraw(listingId: string, revisionNo: number, dataVersion: number): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
};

/**
 * Withdraws a Pending review revision once, before a decision (listing-publish US-2 AC-5, E06S2-D10): it becomes
 * Cancelled and keeps its content. Every outcome but a session answer reads the panel and the listing again once.
 */
export async function runRevisionWithdraw(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: RevisionWithdrawFlowDeps,
): Promise<RevisionCommandOutcome> {
  const outcome = commandOutcome(await deps.withdraw(listingId, revisionNo, dataVersion), "other");
  if (outcome.kind !== "silent") deps.reread();
  return outcome;
}
