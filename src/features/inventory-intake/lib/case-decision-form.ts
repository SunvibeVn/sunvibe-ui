import type { CaseListQuery } from "../services/cases-api";
import type { CaseDecisionInput, CaseOutcome, InventoryCase, InventoryCasePage } from "../types";

import { cleanText, REASON_MAX, type TextProblem, textProblem } from "./intake-text";

// The case pages (property-create intake 4.10, 7.2): the list a manager may read and the decision on one case. The server
// filters out whoever worked a side and checks the decision again.

export const CASE_PAGE_SIZE = 20;

export function caseListQuery(status: CaseListQuery["status"], page: number): CaseListQuery {
  return { status, page, size: CASE_PAGE_SIZE };
}

export function casePageCount(page: Pick<InventoryCasePage, "totalElements">): number {
  return Math.ceil((page.totalElements ?? 0) / CASE_PAGE_SIZE);
}

export type CaseDecisionForm = { outcome: CaseOutcome | ""; proceedingIntakeId: string; basis: string };

export const NEW_DECISION: CaseDecisionForm = { outcome: "", proceedingIntakeId: "", basis: "" };

export type DecisionProblems = { outcome?: "required"; proceeding?: "required"; basis?: TextProblem };

export const isDecidable = (item: Pick<InventoryCase, "status">): boolean => item.status === "OPEN";

/** The two sides of a case between intakes; none for a property candidate. */
export function proceedingChoices(item: Pick<InventoryCase, "intake" | "candidate">): { intakeId: string; code: string }[] {
  const own = item.intake?.intakeId;
  const other = item.candidate?.intakeId;
  if (item.candidate?.kind !== "INTAKE" || !own || !other) return [];
  return [
    { intakeId: own, code: item.intake?.leadCode ?? "" },
    { intakeId: other, code: item.candidate.code ?? "" },
  ];
}

/** Who goes on is named only for the same asset between two intakes (spec 7.2). */
const namesProceeding = (form: CaseDecisionForm, item: InventoryCase): boolean =>
  form.outcome === "SAME_ASSET" && proceedingChoices(item).length > 0;

export function decisionProblems(form: CaseDecisionForm, item: InventoryCase): DecisionProblems {
  const problems: DecisionProblems = {};
  if (form.outcome === "") problems.outcome = "required";
  const sides = proceedingChoices(item).map((choice) => choice.intakeId);
  if (namesProceeding(form, item) && !sides.includes(form.proceedingIntakeId)) problems.proceeding = "required";
  const basis = textProblem(form.basis, REASON_MAX);
  if (basis !== null) problems.basis = basis;
  return problems;
}

export function decisionBody(form: CaseDecisionForm, item: InventoryCase): CaseDecisionInput {
  return {
    outcome: form.outcome,
    ...(namesProceeding(form, item) ? { proceedingIntakeId: form.proceedingIntakeId } : {}),
    basis: cleanText(form.basis),
    expectedVersion: item.version,
  };
}
