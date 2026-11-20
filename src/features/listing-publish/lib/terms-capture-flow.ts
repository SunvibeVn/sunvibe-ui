import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { commandOutcome, type RevisionCommandOutcome } from "./revision-model";

export type TermsSource = "IN_EFFECT" | "PENDING_START";

export type TermsCaptureFlowDeps = {
  capture(listingId: string, revisionNo: number, dataVersion: number, source: TermsSource): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
  rereadSources(): void;
};

/**
 * Takes a terms snapshot of the chosen source once (listing-publish US-2 AC-2, BR-4, E06S2-D6): the body names the
 * source only, never an amount. Every outcome but a session answer reads the panel and the listing again once; a
 * source that is gone (409 `TERMS_SOURCE_ABSENT`) also reads the sources again, so the Sale chooses again.
 */
export async function runTermsCapture(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  source: TermsSource,
  deps: TermsCaptureFlowDeps,
): Promise<RevisionCommandOutcome> {
  const outcome = commandOutcome(await deps.capture(listingId, revisionNo, dataVersion, source), "other");
  if (outcome.kind === "silent") return outcome;
  deps.reread();
  if (outcome.kind === "refused" && outcome.answer === "termsAbsent") deps.rereadSources();
  return outcome;
}
