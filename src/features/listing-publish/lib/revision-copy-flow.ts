import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import type { ListingKey } from "./revision-text";

/** A copy's outcome: `copied`; `refused` with its one sentence; `silent` for a session answer, which shows nothing. */
export type RevisionCopyOutcome = { kind: "copied" } | { kind: "refused"; sentence: ListingKey } | { kind: "silent" };

export type RevisionCopyFlowDeps = {
  copy(listingId: string, revisionNo: number, dataVersion: number): Promise<ApiResult<ListingRevisionChange>>;
  reread(): void;
};

/** The copy's 409 codes and their sentences (spec section 4.6, E06S4-P13); another 409 code is a failure. */
const CONFLICTS: Readonly<Record<string, ListingKey>> = {
  OPEN_REVISION_EXISTS: "decision.answers.openExists",
  REVISION_NOT_COPYABLE: "decision.answers.notCopyable",
  CONCURRENT_MODIFICATION: "decision.answers.concurrent",
  LISTING_ARCHIVED: "decision.answers.archived",
};

function sentenceOf(result: Exclude<ApiResult<ListingRevisionChange>, { ok: true }>): ListingKey {
  if (result.kind !== "http") return "decision.answers.failed";
  if (result.status === 403) return "decision.answers.forbidden";
  if (result.status === 404) return "decision.answers.notFound";
  const code = result.code ?? "";
  if (result.status === 409 && Object.hasOwn(CONFLICTS, code)) return CONFLICTS[code] as ListingKey;
  return "decision.answers.failed";
}

/**
 * Copies a Needs changes revision into a new Draft once (listing-publish US-2 AC-6, E06S4-D14), with the listing's data
 * version, and reads the answer by status and `code`, never by message. Every outcome but a session answer reads the
 * listing again once: the server decides whether a revision is open now.
 */
export async function runRevisionCopy(
  input: { listingId: string; revisionNo: number; dataVersion: number },
  deps: RevisionCopyFlowDeps,
): Promise<RevisionCopyOutcome> {
  const result = await deps.copy(input.listingId, input.revisionNo, input.dataVersion);
  if (!result.ok && (result.kind === "signed-out" || result.kind === "unavailable")) return { kind: "silent" };
  deps.reread();
  return result.ok ? { kind: "copied" } : { kind: "refused", sentence: sentenceOf(result) };
}
