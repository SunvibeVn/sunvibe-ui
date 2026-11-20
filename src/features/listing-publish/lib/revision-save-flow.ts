import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange, ListingRevisionContentBody } from "../types";

import { contentBody, type RevisionFormValues } from "./revision-form";
import { commandOutcome, type RevisionCommandOutcome } from "./revision-model";

export type RevisionSaveFlowDeps = {
  save(listingId: string, revisionNo: number, body: ListingRevisionContentBody): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
};

/**
 * Saves the Draft's whole content once (listing-publish US-2 AC-1, AC-3, E06S2-D4): a partial save keeps an incomplete
 * draft, a blank text is sent as null. The server checks and normalizes the text; a 400 reads the sentence of its
 * `title` or `description` entry. Every outcome but a session answer reads the panel and the listing again once.
 */
export async function runRevisionSave(
  listingId: string,
  revisionNo: number,
  values: RevisionFormValues,
  dataVersion: number,
  deps: RevisionSaveFlowDeps,
): Promise<RevisionCommandOutcome> {
  const outcome = commandOutcome(await deps.save(listingId, revisionNo, contentBody(values, dataVersion)), "save");
  if (outcome.kind !== "silent") deps.reread();
  return outcome;
}
