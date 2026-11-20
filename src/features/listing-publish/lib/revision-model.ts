import type { ApiResult } from "@/features/auth/client";

import type { ListingDetail, ListingFee, ListingRevisionDetail, ListingTerms, ListingUnitSnapshot } from "../types";

import { revisionStatusKey, type RevisionStatusKey } from "./listing-text";
import { formValues, type RevisionFormValues } from "./revision-form";
import {
  assetTypeKey,
  chargeUnitKey,
  FEATURE_NAMES,
  featureLabelKey,
  isOptionFeature,
  type ListingKey,
  optionLabelKey,
  type Phrase,
  problemSentence,
  sourceKey,
  wholeVnd,
} from "./revision-text";

/**
 * What the "Current revision" panel takes from the listing read (spec section 6, E06S2-D20): the open revision's
 * number or null, the listing's data version every command sends back, and whether the viewer drafts, a hint: the
 * server decides every command (E06S2-D2).
 */
export type RevisionPanelInput = { openRevisionNo: number | null; dataVersion: number; viewerMayDraft: boolean };

/** The panel's input: only the assigned Sale of a listing that is not archived is offered the commands. */
export function revisionPanelOf(listing: ListingDetail): RevisionPanelInput {
  return {
    openRevisionNo: listing.openRevisionNo,
    dataVersion: listing.dataVersion,
    viewerMayDraft: listing.viewerIsAssignedSale && listing.state !== "ARCHIVED",
  };
}

/** A terms snapshot as the page shows it: where it comes from, when it was taken, and its lines. */
export type RevisionTermsScreen = {
  sourceKey: ListingKey;
  /** The pending version's start date (`YYYY-MM-DD`), the value `date` of its source text; null in effect. */
  pendingStartDate: string | null;
  capturedAt: string;
  lines: Phrase[];
};

/** One revision as the panel shows it (E06S2-D14); the texts are content, shown as text only. */
export type RevisionScreen = {
  revisionNo: number;
  statusKey: RevisionStatusKey;
  title: string | null;
  description: string | null;
  /** The chosen features only, in the form's order: "Air conditioner", "Kitchen: Private". */
  features: Phrase[];
  terms: RevisionTermsScreen | null;
  /** The unit at submission (E06S2-D12); null before it. */
  unit: Phrase[] | null;
  /** What a submission would refuse now, one sentence each; empty unless Draft (RD-15). */
  problems: Phrase[];
  submittedAt: string | null;
  dataVersion: number;
};

/**
 * The panel after its read. `hidden`: the session answers, which show nothing (E06S1-P8); `notFound`: the one 404 of an
 * unknown or out-of-scope listing or revision; `ready`: the form for a Draft of the assigned Sale (`edit`), else the
 * content read-only (`read`), with "Withdraw" for the assigned Sale's Pending review revision.
 */
export type RevisionPanelModel =
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "notFound" }
  | { kind: "ready"; mode: "edit" | "read"; mayWithdraw: boolean; screen: RevisionScreen; values: RevisionFormValues };

/** The deposit's line (ADR-006): 0 months or an amount of 0 is "No deposit". */
function depositLine(deposit: ListingTerms["deposit"]): Phrase {
  if (deposit.basis === "MONTHS" && deposit.months !== null) {
    return deposit.months === 0 ? { key: "revision.terms.noDeposit" } : { key: "revision.terms.depositMonths", values: { months: deposit.months } };
  }
  if (deposit.basis === "AMOUNT" && deposit.amount !== null) {
    return deposit.amount === 0
      ? { key: "revision.terms.noDeposit" }
      : { key: "revision.terms.depositAmount", values: { amount: wholeVnd(deposit.amount) } };
  }
  return { key: "revision.terms.depositOther" };
}

/** A mandatory fee's line by its basis; its name is E05's content, a value shown as text. */
function feeLine(fee: ListingFee): Phrase {
  const name = fee.name;
  switch (fee.basis) {
    case "AMOUNT":
      if (fee.amount === null) break;
      return {
        key: "revision.terms.feeAmount",
        values: { name, amount: wholeVnd(fee.amount), unit: { key: chargeUnitKey(fee.chargeUnit ?? "") } },
      };
    case "INCLUDED":
      return { key: "revision.terms.feeIncluded", values: { name } };
    case "PROVIDER_TARIFF":
      return { key: "revision.terms.feeProviderTariff", values: { name } };
  }
  return { key: "revision.terms.feeOther", values: { name } };
}

/**
 * The lines of E05's terms as a snapshot copies them (spec section 6, E06S2-D6): rent, deposit, minimum term, payment
 * period, then each mandatory fee in E05's order. Read-only: no request carries an amount.
 */
export function termsLines(terms: ListingTerms): Phrase[] {
  return [
    { key: "revision.terms.rent", values: { amount: wholeVnd(terms.monthlyRent.amount) } },
    depositLine(terms.deposit),
    { key: "revision.terms.minimumTerm", values: { months: terms.minimumTermMonths } },
    { key: "revision.terms.paymentPeriod", values: { months: terms.paymentPeriodMonths } },
    ...terms.mandatoryFees.map(feeLine),
  ];
}

/** The unit at submission: its type, its catalog ward and province when both are set, its rooms and its area. */
function unitLines(unit: ListingUnitSnapshot): Phrase[] {
  const lines: Phrase[] = [];
  if (unit.assetType !== null) lines.push({ key: assetTypeKey(unit.assetType) });
  if (unit.wardName !== null && unit.provinceName !== null) {
    lines.push({ key: "revision.unit.place", values: { ward: unit.wardName, province: unit.provinceName } });
  }
  lines.push({ key: "revision.unit.rooms", values: { bedrooms: unit.bedrooms, bathrooms: unit.bathrooms } });
  lines.push({ key: "revision.unit.area", values: { area: unit.areaSqm } });
  return lines;
}

/** The chosen features: a yes-feature that is true, an option feature with an option; the rest is not listed. */
function featureLines(features: ListingRevisionDetail["features"]): Phrase[] {
  const lines: Phrase[] = [];
  for (const name of FEATURE_NAMES) {
    if (isOptionFeature(name)) {
      const option = features[name];
      if (option !== null && option !== undefined) {
        lines.push({
          key: "revision.features.chosen",
          values: { feature: { key: featureLabelKey(name) }, option: { key: optionLabelKey(option) } },
        });
      }
    } else if (features[name] === true) {
      lines.push({ key: featureLabelKey(name) });
    }
  }
  return lines;
}

function screenOf(detail: ListingRevisionDetail): RevisionScreen {
  const snapshot = detail.termsSnapshot;
  return {
    revisionNo: detail.revisionNo,
    statusKey: revisionStatusKey(detail.status),
    title: detail.title,
    description: detail.description,
    features: featureLines(detail.features),
    terms:
      snapshot === null
        ? null
        : {
            sourceKey: sourceKey(snapshot.source),
            pendingStartDate: snapshot.pendingStartDate,
            capturedAt: snapshot.capturedAt,
            lines: termsLines(snapshot.terms),
          },
    unit: detail.unitSnapshot === null ? null : unitLines(detail.unitSnapshot),
    problems: detail.problems.map(problemSentence),
    submittedAt: detail.submittedAt,
    dataVersion: detail.dataVersion,
  };
}

/**
 * The panel's model from the revision read (spec section 6): a Draft is the form for the assigned Sale and read-only
 * for anyone else; every other status is read-only, and a Pending review revision offers "Withdraw" to the assigned
 * Sale (US-2 AC-5).
 */
export function revisionPanelModel(result: ApiResult<ListingRevisionDetail>, panel: RevisionPanelInput): RevisionPanelModel {
  if (result.ok) {
    const detail = result.data;
    return {
      kind: "ready",
      mode: detail.status === "DRAFT" && panel.viewerMayDraft ? "edit" : "read",
      mayWithdraw: detail.status === "PENDING_REVIEW" && panel.viewerMayDraft,
      screen: screenOf(detail),
      values: formValues(detail),
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "notFound" } : { kind: "error" };
  }
}
