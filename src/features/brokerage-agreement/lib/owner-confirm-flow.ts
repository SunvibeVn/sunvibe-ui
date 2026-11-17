import type { ApiResult } from "@/features/auth/client";

import { confirmVersions as postConfirmations } from "../services/owner-agreement-api";
import type { BrokerageAgreementConfirmationRequest } from "../types";

import { type EligibilityKey, reasonText } from "./reason-text";

/** A version of the request that cannot be confirmed now, with one text per reason group (BR-3, E-2, E-5, E-11). */
export type NotEligibleItem = { agreementId: string; versionNo: number; groupKeys: EligibilityKey[] };

/** What one confirmation ended with, for the confirm form (brokerage-agreement E05-S5, spec section 6). */
export type OwnerConfirmOutcome =
  | { kind: "confirmed" }
  /**
   * `wrongPassword`: the password is not the account's; `locked`: too many wrong passwords; `tooMany`: the rate limit;
   * `reload`: the page is out of date (a version no longer waiting, a changed statement, a version gone); `concurrent`: a
   * change at the same moment.
   */
  | { kind: "refused"; reason: "wrongPassword" | "locked" | "tooMany" | "reload" | "concurrent" }
  /** Per failing item, in the request's order, its version and its group texts in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; items: NotEligibleItem[] }
  | { kind: "failed"; correlationId?: string };

export type OwnerConfirmFlowDeps = {
  confirmVersions(body: BrokerageAgreementConfirmationRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: OwnerConfirmFlowDeps = { confirmVersions: (body) => postConfirmations(body) };

const PASSWORD_FIELD = "currentPassword";

/** `versions[<index>].reasonGroups.<GROUP>`: the item of the request and the group that stops it. */
const ITEM_GROUP = /^versions\[(\d+)\]\.reasonGroups\.(.+)$/;

/** The items of a 409 `AGREEMENT_NOT_ELIGIBLE`, each with its groups; an entry naming no item of the request is dropped. */
function notEligibleItems(body: BrokerageAgreementConfirmationRequest, fields: string[]): NotEligibleItem[] {
  const groups = new Map<number, EligibilityKey[]>();
  for (const field of fields) {
    const match = ITEM_GROUP.exec(field);
    if (match === null) continue;
    const index = Number(match[1]);
    if (body.versions[index] === undefined) continue;
    groups.set(index, [...(groups.get(index) ?? []), reasonText(match[2] ?? "")]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, groupKeys]) => {
      const item = body.versions[index];
      return item === undefined ? [] : [{ agreementId: item.agreementId, versionNo: item.versionNo, groupKeys }];
    });
}

/**
 * Sends one confirmation (brokerage-agreement US-2 AC-2, AC-4, S5-D4 to S5-D6) and reads the answer by kind, status,
 * `code` and field, never by message: 204 → `confirmed`; 400 whose only entry is `currentPassword` → `wrongPassword`;
 * 423 `ACCOUNT_LOCKED` → `locked`; 429 → `tooMany`; 404, 409 `AGREEMENT_NOT_AWAITING_OWNER` and
 * `AGREEMENT_STATEMENT_OUTDATED` → `reload`; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` per item; 409
 * `CONCURRENT_MODIFICATION` → `concurrent`; any other answer (another 400, 403, 500, no answer, no session) → `failed`
 * with its support code. The password is never part of an outcome.
 */
export async function confirmVersions(
  body: BrokerageAgreementConfirmationRequest,
  deps: OwnerConfirmFlowDeps = DEFAULT_DEPS,
): Promise<OwnerConfirmOutcome> {
  const result = await deps.confirmVersions(body);
  if (result.ok) return { kind: "confirmed" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 400 && fieldErrors.length > 0 && fieldErrors.every((entry) => entry.field === PASSWORD_FIELD)) {
    return { kind: "refused", reason: "wrongPassword" };
  }
  if (status === 423 && code === "ACCOUNT_LOCKED") return { kind: "refused", reason: "locked" };
  if (status === 429) return { kind: "refused", reason: "tooMany" };
  if (status === 404) return { kind: "refused", reason: "reload" };
  if (status === 409 && (code === "AGREEMENT_NOT_AWAITING_OWNER" || code === "AGREEMENT_STATEMENT_OUTDATED")) {
    return { kind: "refused", reason: "reload" };
  }
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const fields = fieldErrors.map((entry) => entry.field);
    return { kind: "refused", reason: "notEligible", items: notEligibleItems(body, fields) };
  }
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "concurrent" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
