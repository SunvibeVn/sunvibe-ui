import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionDetail, ListingRevisionReview } from "../types";

import { formatCalendarDate } from "./freshness-model";
import { reasonGroupKey, type ReasonGroupKey, revisionStatusKey, type RevisionStatusKey } from "./listing-text";
import { availabilityKey, checkKey, ineligibilityKey, termsMatchKey } from "./review-text";
import { revisionPanelModel, type RevisionScreen, termsLines } from "./revision-model";
import type { ListingKey, Phrase } from "./revision-text";

/** E05's answer for the listing's unit and agreement, as the "Agreement" section shows it (dates formatted). */
export type ReviewAgreement = {
  allowed: boolean;
  /** E05's reason groups, one sentence each, in E05's order; shown when advertising is not allowed. */
  reasonKeys: ReasonGroupKey[];
  endDate: string | null;
  interiorPhotos: boolean;
  exteriorPhotos: boolean;
  termsInEffect: Phrase[] | null;
  pending: { startDate: string; lines: Phrase[] } | null;
};

/** The "Unit" section: property's unit code and availability, and the ward of the revision's unit snapshot. */
export type ReviewUnit = { code: string | null; ward: string | null; availabilityKey: ListingKey | null; availabilityDiffers: boolean };

/** The "Freshness" section: the latest valid confirmation's dates (formatted), "Expired", and the latest record's validity. */
export type ReviewFreshness = { confirmedOn: string | null; validThrough: string | null; deadlinePassed: boolean; latestValid: boolean | null };

/** The review page when both reads answered (spec section 6, E06S4-D11). */
export type ReviewReady = {
  kind: "ready";
  /** The listing's public code, from the review read. */
  code: string;
  revisionNo: number;
  statusKey: RevisionStatusKey;
  /** The server says the reader may decide now: the location button and the decision form show (E06S4-D12, D17). */
  mayDecide: boolean;
  /** Why not, one sentence each, in the server's order; empty exactly when `mayDecide`. */
  reasonKeys: ListingKey[];
  /** The revision's content, read-only, as the "Current revision" panel shows it; text only. */
  screen: RevisionScreen;
  /** Null when E05 answers nothing for the pair. */
  agreement: ReviewAgreement | null;
  termsMatch: string;
  termsMatchKey: ListingKey;
  unit: ReviewUnit;
  freshness: ReviewFreshness;
  /** The checklist, version 1, in the server's order. */
  checklist: { code: string; key: ListingKey }[];
  /** The listing's data version a decision sends back. */
  dataVersion: number;
};

/**
 * The review page (spec section 6, E06S4-D17). `loading` until both reads answered; `hidden` for a session answer of
 * either; `forbidden` for the review read's 403 (a role outside the four of E06S4-D2); `notFound` for a 404 of either;
 * `error` for any other failure, the other read answered or not, so the page never shows half of itself.
 */
export type ReviewPageModel = { kind: "loading" } | { kind: "hidden" } | { kind: "forbidden" } | { kind: "notFound" } | { kind: "error" } | ReviewReady;

/** What a re-read in place answers: the model to show, whether the form keeps its values, whether it failed. */
export type RereadOutcome = { model: ReviewReady; keepForm: boolean; rereadFailed: boolean };

/**
 * The revision number of the page's address, read only in canonical decimal form of 1 or more (E06S4-P11): `"01"` or
 * `"1.0"` would reach the server as text it answers 404, while the revision read takes a number. Null shows the 404.
 */
export function revisionNoOf(text: string): number | null {
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 1 && String(number) === text ? number : null;
}

function agreementOf(advertising: NonNullable<ListingRevisionReview["advertising"]>): ReviewAgreement {
  return {
    allowed: advertising.allowed,
    reasonKeys: advertising.reasonGroups.map(reasonGroupKey),
    endDate: advertising.endDate === null ? null : formatCalendarDate(advertising.endDate),
    interiorPhotos: advertising.interiorPhotos,
    exteriorPhotos: advertising.exteriorPhotos,
    termsInEffect: advertising.termsInEffect === null ? null : termsLines(advertising.termsInEffect),
    pending:
      advertising.pending === null
        ? null
        : { startDate: formatCalendarDate(advertising.pending.startDate), lines: termsLines(advertising.pending.terms) },
  };
}

function readyOf(review: ListingRevisionReview, revision: ListingRevisionDetail): ReviewReady | { kind: "error" } {
  const panel = revisionPanelModel(
    { ok: true, status: 200, replayed: false, data: revision },
    { openRevisionNo: revision.revisionNo, dataVersion: review.dataVersion, viewerMayDraft: false },
  );
  if (panel.kind !== "ready") return { kind: "error" };
  const { freshness, unit } = review;
  return {
    kind: "ready",
    code: review.code,
    revisionNo: review.revisionNo,
    statusKey: revisionStatusKey(review.status),
    mayDecide: review.viewerMayReview,
    reasonKeys: review.notEligibleReasons.map(ineligibilityKey),
    screen: panel.screen,
    agreement: review.advertising === null ? null : agreementOf(review.advertising),
    termsMatch: review.termsMatch,
    termsMatchKey: termsMatchKey(review.termsMatch),
    unit: {
      code: unit.unitCode,
      ward: revision.unitSnapshot?.wardName ?? null,
      availabilityKey: unit.availability === null ? null : availabilityKey(unit.availability),
      availabilityDiffers: unit.availabilityDiffers,
    },
    freshness: {
      confirmedOn: freshness.confirmedOn === null ? null : formatCalendarDate(freshness.confirmedOn),
      validThrough: freshness.validThrough === null ? null : formatCalendarDate(freshness.validThrough),
      deadlinePassed: freshness.deadlinePassed,
      latestValid: freshness.latestValid,
    },
    checklist: review.checklist.map((code) => ({ code, key: checkKey(code) })),
    dataVersion: review.dataVersion,
  };
}

const isSession = (result: ApiResult<unknown>) => !result.ok && (result.kind === "signed-out" || result.kind === "unavailable");
const isStatus = (result: ApiResult<unknown>, status: number) => !result.ok && result.kind === "http" && result.status === status;

export function reviewPageModel(
  review: ApiResult<ListingRevisionReview> | null,
  revision: ApiResult<ListingRevisionDetail> | null,
): ReviewPageModel {
  if (review === null || revision === null) return { kind: "loading" };
  if (isSession(review) || isSession(revision)) return { kind: "hidden" };
  if (isStatus(review, 403)) return { kind: "forbidden" };
  if (isStatus(review, 404) || isStatus(revision, 404)) return { kind: "notFound" };
  if (!review.ok || !revision.ok) return { kind: "error" };
  return readyOf(review.data, revision.data);
}

/**
 * A re-read in place after a decision's answer (spec section 6): both answered, the new model shows and the form keeps
 * every value exactly when the reader may still decide (it then sends the re-read's data version); anything else keeps
 * what is shown, without the form, and offers "Try again".
 */
export function rereadOutcome(
  shown: ReviewReady,
  review: ApiResult<ListingRevisionReview>,
  revision: ApiResult<ListingRevisionDetail>,
): RereadOutcome {
  const model = review.ok && revision.ok ? readyOf(review.data, revision.data) : null;
  if (model === null || model.kind !== "ready") return { model: shown, keepForm: false, rereadFailed: true };
  return { model, keepForm: model.mayDecide, rereadFailed: false };
}
