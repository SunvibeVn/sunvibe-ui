import type { ApiResult } from "@/features/auth/client";

import type { ListingCreated } from "../types";

import { listingPath } from "./listing-model";

/** A refused or failed create's sentence, a key of the `ListingPublish` namespace (spec section 6). */
export type ListingCreateSentence = "create.exists" | "create.notAllowed" | "create.notFound" | "create.concurrent" | "create.failed";

export type ListingCreateOutcome = { kind: "created" } | { kind: "refused"; sentence: ListingCreateSentence };

export type ListingCreateFlowDeps = {
  create(agreementId: string): Promise<ApiResult<ListingCreated>>;
  goTo(path: string): void;
  reread(): void;
};

/** The sentence of each 409 code the create answers (spec section 4); another 409 code is a failure. */
const CONFLICT_SENTENCES: Readonly<Record<string, ListingCreateSentence>> = {
  LISTING_EXISTS: "create.exists",
  LISTING_NOT_ALLOWED: "create.notAllowed",
  CONCURRENT_MODIFICATION: "create.concurrent",
};

function sentenceOf(result: Exclude<ApiResult<ListingCreated>, { ok: true }>): ListingCreateSentence {
  if (result.kind !== "http") return "create.failed";
  if (result.status === 404) return "create.notFound";
  if (result.status === 409 && result.code !== undefined && Object.hasOwn(CONFLICT_SENTENCES, result.code)) {
    return CONFLICT_SENTENCES[result.code] as ListingCreateSentence;
  }
  return "create.failed";
}

/**
 * Creates the agreement's listing once (listing-publish US-1 AC-1, AC-2, E-2) and reads the answer by status and
 * `code`, never by message: 201 → the listing's page; 409 `LISTING_EXISTS`, 409 `LISTING_NOT_ALLOWED`, 404 and 409
 * `CONCURRENT_MODIFICATION` → their sentences; anything else (403, 500, no answer, a session answer, another code) →
 * "could not be created". Every outcome but a created listing reads the section again once, since a lost answer may
 * hide a created listing and the server decides what may be created now.
 */
export async function runListingCreate(agreementId: string, deps: ListingCreateFlowDeps): Promise<ListingCreateOutcome> {
  const result = await deps.create(agreementId);
  if (result.ok) {
    deps.goTo(listingPath(result.data.listingId));
    return { kind: "created" };
  }
  const sentence = sentenceOf(result);
  deps.reread();
  return { kind: "refused", sentence };
}
