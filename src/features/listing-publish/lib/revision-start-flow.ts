import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { commandOutcome, type RevisionCommandOutcome } from "./revision-model";

export type RevisionStartFlowDeps = {
  start(listingId: string, dataVersion: number): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
};

/**
 * Starts a new empty Draft once (listing-publish US-2 AC-6, E06S2-D10), with the listing's data version, and reads the
 * answer by status and `code`, never by message. Every outcome but a session answer reads the panel and the listing
 * again once: the server decides whether a revision is open now.
 */
export async function runRevisionStart(
  listingId: string,
  dataVersion: number,
  deps: RevisionStartFlowDeps,
): Promise<RevisionCommandOutcome> {
  const outcome = commandOutcome(await deps.start(listingId, dataVersion), "other");
  if (outcome.kind !== "silent") deps.reread();
  return outcome;
}
