import type { ApiResult } from "@/features/auth/client";
import { BROKERAGE_AGREEMENTS_PATH } from "@/features/workspace";
import type { ListOutcome } from "@/lib/use-url-list";

import type {
  BrokerageAgreementAdvertising,
  BrokerageAgreementListAdvertising,
  BrokerageAgreementListItem,
  BrokerageAgreementPage,
} from "../types";

import { advertisingReasonText } from "./advertising-text";
import type { EligibilityKey } from "./reason-text";
import { agreementStatusText, versionBadgeText } from "./status-text";
import type { Phrase } from "./version-terms-model";

/**
 * One row of the agreement list (brokerage-agreement E05-S7, US-4 AC-3, spec section 6): the link to the agreement's
 * page, the unit code (null when the unit had none), the state and the latest version at the read, the advertising answer
 * at the read, and the creation time (an instant in UTC). Nothing else of the item: no term, fee, owner value or user id
 * (BR-17).
 */
export type AgreementListRow = {
  agreementId: string;
  href: string;
  unitCode: string | null;
  statusKey: EligibilityKey;
  version: { number: number; statusKey: EligibilityKey } | null;
  advertising: { allowed: true; endDate: string | null } | { allowed: false; reasons: Phrase[] };
  createdAt: string | null;
};

/** What a failed list read leaves on screen: nothing for a session state, else the error with its support code. */
export type AgreementListError = { kind: "session" } | { kind: "failed"; correlationId?: string };

const present = (value: string | null | undefined): value is string => typeof value === "string" && value !== "";

/**
 * A row's advertising answer as the existing input of `advertisingReasonText`, the type the detail reads
 * (brokerage-agreement S7-D5, spec section 6): `allowed`, the groups and the end as the row holds them, and the start
 * date of the version not started yet as `pendingVersion.startDate`. Never the terms or the photo consent, which the list
 * does not answer. A part the row leaves out stays out.
 */
export function listAdvertisingAnswer(advertising: BrokerageAgreementListAdvertising | undefined): BrokerageAgreementAdvertising {
  const answer: BrokerageAgreementAdvertising = {};
  if (advertising?.allowed !== undefined) answer.allowed = advertising.allowed;
  if (advertising?.reasonGroups !== undefined) answer.reasonGroups = advertising.reasonGroups;
  if (advertising?.endDate !== undefined) answer.endDate = advertising.endDate;
  if (advertising?.endsAt !== undefined) answer.endsAt = advertising.endsAt;
  answer.pendingVersion = present(advertising?.startDate) ? { startDate: advertising.startDate } : null;
  return answer;
}

/**
 * The advertising lines of a row (brokerage-agreement US-4 AC-1, S6-D8, S7-D5): only `allowed` true reads as allowed,
 * with its end date; anything else is not allowed, one line per group in the answer's order, and an answer naming no
 * group reads the one fallback line, so nothing absent ever reads as allowed. The ENDED line reads the row's state, null
 * when the row has none (E05-S8, S8-D16).
 */
function advertisingOf(
  advertising: BrokerageAgreementListAdvertising | undefined,
  status: string | null,
): AgreementListRow["advertising"] {
  const answer = listAdvertisingAnswer(advertising);
  if (answer.allowed === true) return { allowed: true, endDate: present(answer.endDate) ? answer.endDate : null };
  const reasons = (answer.reasonGroups ?? []).map((group) => advertisingReasonText(group, answer, status));
  return { allowed: false, reasons: reasons.length === 0 ? [{ key: "eligibility.reasons.OTHER" }] : reasons };
}

function rowOf(item: BrokerageAgreementListItem & { agreementId: string }): AgreementListRow {
  const { agreementId, unitCode, status, latestVersionNo, latestVersionStatus, createdAt, advertising } = item;
  return {
    agreementId,
    href: `${BROKERAGE_AGREEMENTS_PATH}/${encodeURIComponent(agreementId)}`,
    unitCode: unitCode ?? null,
    statusKey: agreementStatusText(status ?? ""),
    // "Version <n>: <state>", an EFFECTIVE version of an ended agreement read with it (S8-D16, E05S8-P11).
    version:
      latestVersionNo === undefined
        ? null
        : { number: latestVersionNo, statusKey: versionBadgeText(latestVersionStatus ?? "", status) },
    advertising: advertisingOf(advertising, status ?? null),
    createdAt: present(createdAt) ? createdAt : null,
  };
}

/** The rows of a list page, in the server's order; an item without an id, which has no page to link to, is left out. */
export function agreementListRows(page: BrokerageAgreementPage): AgreementListRow[] {
  return (page.items ?? [])
    .filter((item): item is BrokerageAgreementListItem & { agreementId: string } => present(item.agreementId))
    .map(rowOf);
}

/**
 * Turns the list answer into the list's outcome (brokerage-agreement E05-S7, spec section 6), by kind, never by message:
 * 200 → the page; signed out or unavailable → the session screens answer; any other failure → the error, with the
 * support code of an http answer.
 */
export function agreementListOutcome(
  result: ApiResult<BrokerageAgreementPage>,
): ListOutcome<BrokerageAgreementPage, AgreementListError> {
  if (result.ok) return { kind: "page", page: result.data };
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "error", error: { kind: "session" } };
    case "network":
      return { kind: "error", error: { kind: "failed" } };
    case "http":
      return {
        kind: "error",
        error: result.correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId: result.correlationId },
      };
  }
}
