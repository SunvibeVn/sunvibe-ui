import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { commandOutcome, type RevisionCommandOutcome } from "./revision-model";

export type RevisionSubmitFlowDeps = {
  submit(listingId: string, revisionNo: number, dataVersion: number): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
};

/**
 * Submits the Draft for review once (listing-publish US-2 AC-4, AC-5, E06S2-D7). The server runs every rule; a 422
 * `REVISION_NOT_SUBMITTABLE` answers its entries, read here as problems in the server's order, one sentence each. Every
 * outcome but a session answer reads the panel and the listing again once.
 */
export async function runRevisionSubmit(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: RevisionSubmitFlowDeps,
): Promise<RevisionCommandOutcome> {
  const outcome = commandOutcome(await deps.submit(listingId, revisionNo, dataVersion), "other");
  if (outcome.kind !== "silent") deps.reread();
  return outcome;
}
