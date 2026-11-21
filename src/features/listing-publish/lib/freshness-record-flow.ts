import { freshnessRecordSchema } from "../schemas/freshness-record.schema";
import type { recordListingFreshness } from "../services/freshness-api";

import { type FieldErrors, type FormState, fieldErrorsOf, invalidState, messageState, successState } from "./form-state";
import { type FreshnessFormValues, requestBody } from "./freshness-record-form";
import type { ListingKey } from "./revision-text";

/** The refusals of a record, each with its one sentence (spec section 6). */
export type FreshnessRecordAnswer = "invalid" | "notFound" | "archived" | "concurrent" | "failed";

export type FreshnessRecordOutcome =
  | { kind: "done"; valid: boolean }
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | { kind: "refused"; answer: FreshnessRecordAnswer };

/** What the record tells the page, which decides the listing re-read (E06S3-D12, P8). */
export type ListingChange = "recorded" | "concurrent" | "gone";

export type FreshnessRecordFlowDeps = { record: typeof recordListingFreshness };

const ANSWER_KEYS: Record<FreshnessRecordAnswer, ListingKey> = {
  invalid: "freshness.answers.invalid",
  notFound: "freshness.answers.notFound",
  archived: "freshness.answers.archived",
  concurrent: "freshness.answers.concurrent",
  failed: "freshness.answers.failed",
};

function answerOf(status: number, code: string | undefined): FreshnessRecordAnswer {
  if (status === 400) return "invalid";
  if (status === 404) return "notFound";
  if (status === 409 && code === "LISTING_ARCHIVED") return "archived";
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return "concurrent";
  return "failed";
}

/**
 * Records one contact (listing-publish US-6 AC-1, E06S3-P13 (3)): the values are checked with the form's schema first
 * and nothing is sent when it refuses them; else one POST with the listing's data version the page read. The server
 * decides the record; its answer is mapped by status and code, never by its text.
 */
export async function runFreshnessRecord(
  listingId: string,
  values: FreshnessFormValues,
  dataVersion: number,
  deps: FreshnessRecordFlowDeps,
): Promise<FreshnessRecordOutcome> {
  const parsed = freshnessRecordSchema.safeParse(values);
  if (!parsed.success) return { kind: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  const result = await deps.record(listingId, requestBody(parsed.data, dataVersion));
  if (result.ok) return { kind: "done", valid: result.data.valid };
  if (result.kind === "http") return { kind: "refused", answer: answerOf(result.status, result.code) };
  return { kind: "refused", answer: "failed" };
}

/**
 * The listing re-read a record's outcome asks for (spec section 6, E06S3-P8): a record moved the data version; a 409
 * `CONCURRENT_MODIFICATION` means the page holds an old one; a 404 means the listing left the viewer's scope. Nothing
 * else asks for one.
 */
export function listingChangeOf(outcome: FreshnessRecordOutcome): ListingChange | null {
  if (outcome.kind === "done") return "recorded";
  if (outcome.kind === "refused" && outcome.answer === "concurrent") return "concurrent";
  if (outcome.kind === "refused" && outcome.answer === "notFound") return "gone";
  return null;
}

/** The form's state after an outcome: success, the fields' problems, or the refusal's one sentence. */
export function formStateOf(outcome: FreshnessRecordOutcome): FormState {
  switch (outcome.kind) {
    case "done":
      return successState();
    case "invalid":
      return invalidState(outcome.fieldErrors);
    case "refused":
      return messageState(ANSWER_KEYS[outcome.answer]);
  }
}
