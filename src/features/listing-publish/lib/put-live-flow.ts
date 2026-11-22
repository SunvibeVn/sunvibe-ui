import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange } from "../types";

import { reasonGroupKey, type ReasonGroupKey } from "./listing-text";
import { displayReasonKey } from "./publication-text";
import type { ListingKey } from "./revision-text";

/**
 * A put live's outcome: `live`; `refused` with the reasons and E05's groups of a 409 PUT_LIVE_REFUSED; `sentence` with
 * its one sentence and whether the page reads again (a stale data version, a revision no longer Approved); `silent`
 * for a session answer, which shows nothing.
 */
export type PutLiveOutcome =
  | { kind: "live" }
  | { kind: "refused"; reasonKeys: ListingKey[]; groupKeys: ReasonGroupKey[] }
  | { kind: "sentence"; sentence: ListingKey; reread: boolean }
  | { kind: "silent" };

export type PutLiveFlowDeps = {
  putLive(listingId: string, revisionNo: number, dataVersion: number): Promise<ApiResult<ListingRevisionChange>>;
};

const REASON_ENTRY = "reasons.";
const GROUP_ENTRY = "reasonGroups.";

/** The 409 codes after which the page reads again (spec section 6), and their sentences. */
const REREAD_409: Readonly<Record<string, ListingKey>> = {
  CONCURRENT_MODIFICATION: "decision.answers.concurrent",
  REVISION_NOT_APPROVED: "publication.answers.notApproved",
};

function sentenceOf(result: Exclude<ApiResult<ListingRevisionChange>, { ok: true }>): { sentence: ListingKey; reread: boolean } {
  if (result.kind !== "http") return { sentence: "decision.answers.failed", reread: false };
  const code = result.code ?? "";
  if (result.status === 409 && Object.hasOwn(REREAD_409, code)) return { sentence: REREAD_409[code] as ListingKey, reread: true };
  if (result.status === 409 && code === "LISTING_ARCHIVED") return { sentence: "publication.answers.archived", reread: false };
  if (result.status === 403) return { sentence: "publication.answers.forbidden", reread: false };
  if (result.status === 404) return { sentence: "page.notFound", reread: false };
  return { sentence: "decision.answers.failed", reread: false };
}

/**
 * Puts an Approved revision live once (listing-publish US-5 AC-1, AC-3, E06S6-D5) with the publication read's data
 * version, and reads the answer by status, `code` and the entries' fields, never by message. A refusal lists its
 * reasons in the answer's order (E06S6-D19); a refusal without a reason entry still says that a condition stops it.
 */
export async function runPutLive(
  deps: PutLiveFlowDeps,
  input: { listingId: string; revisionNo: number; dataVersion: number },
): Promise<PutLiveOutcome> {
  const result = await deps.putLive(input.listingId, input.revisionNo, input.dataVersion);
  if (result.ok) return { kind: "live" };
  if (result.kind === "signed-out" || result.kind === "unavailable") return { kind: "silent" };
  if (result.kind === "http" && result.status === 409 && result.code === "PUT_LIVE_REFUSED") {
    const reasonKeys: ListingKey[] = [];
    const groupKeys: ReasonGroupKey[] = [];
    for (const { field } of result.fieldErrors) {
      if (field.startsWith(REASON_ENTRY)) reasonKeys.push(displayReasonKey(field.slice(REASON_ENTRY.length)));
      else if (field.startsWith(GROUP_ENTRY)) groupKeys.push(reasonGroupKey(field.slice(GROUP_ENTRY.length)));
    }
    return { kind: "refused", reasonKeys: reasonKeys.length === 0 ? ["publication.reasons.OTHER"] : reasonKeys, groupKeys };
  }
  return { kind: "sentence", ...sentenceOf(result) };
}
