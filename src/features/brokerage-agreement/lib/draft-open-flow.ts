import type { ApiResult } from "@/features/auth/client";

import { openDraft as postNewDraft } from "../services/agreement-api";
import type { BrokerageAgreementNewDraftRequest } from "../types";

import { type EligibilityKey, reasonText } from "./reason-text";

/** What one "Open a new draft" ended with, for the staff page (brokerage-agreement E05-S5, spec section 6). */
export type DraftOpenOutcome =
  | { kind: "opened" }
  /** The basis cannot hold an agreement now: one text per reason group, in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; groupKeys: EligibilityKey[] }
  /**
   * `notAllowed`: a version is still pending (the page is out of date); `stale`: the agreement changed since the page
   * read it; `notAssignee`: not the lead's assigned Sale; `notFound`: unknown, not visible or a role that may not open it.
   */
  | { kind: "refused"; reason: "notAllowed" | "stale" | "notAssignee" | "notFound" }
  | { kind: "failed"; correlationId?: string };

export type DraftOpenFlowDeps = {
  openDraft(agreementId: string, body: BrokerageAgreementNewDraftRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: DraftOpenFlowDeps = { openDraft: (agreementId, body) => postNewDraft(agreementId, body) };

const GROUP_PREFIX = "reasonGroups.";

/**
 * Opens the next draft version once with the data version the page read (brokerage-agreement BR-5, S5-D10) and reads
 * the answer by kind, status and `code`, never by message (S5-D14): 204 → `opened`; 409
 * `AGREEMENT_NEW_DRAFT_NOT_ALLOWED` → `notAllowed`; 409 `CONCURRENT_MODIFICATION`, a stale data version or a lost race
 * alike → `stale`; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` with the group texts; 403 `AGREEMENT_NOT_ASSIGNEE` →
 * `notAssignee`; 404 and 403 `FORBIDDEN` → `notFound`; any other answer (400, 500, no answer, no session) → `failed` with
 * its support code.
 */
export async function openDraft(
  agreementId: string,
  dataVersion: number,
  deps: DraftOpenFlowDeps = DEFAULT_DEPS,
): Promise<DraftOpenOutcome> {
  const result = await deps.openDraft(agreementId, { expectedDataVersion: dataVersion });
  if (result.ok) return { kind: "opened" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 409 && code === "AGREEMENT_NEW_DRAFT_NOT_ALLOWED") return { kind: "refused", reason: "notAllowed" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "stale" };
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const groupKeys = fieldErrors
      .filter((entry) => entry.field.startsWith(GROUP_PREFIX))
      .map((entry) => reasonText(entry.field.slice(GROUP_PREFIX.length)));
    return { kind: "refused", reason: "notEligible", groupKeys };
  }
  if (status === 403 && code === "AGREEMENT_NOT_ASSIGNEE") return { kind: "refused", reason: "notAssignee" };
  if (status === 404 || (status === 403 && code === "FORBIDDEN")) return { kind: "refused", reason: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
