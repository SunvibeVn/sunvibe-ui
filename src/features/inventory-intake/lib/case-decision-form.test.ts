import { describe, expect, it } from "vitest";

import { INVENTORY_CASE_ROLES, INVENTORY_CASES_PATH } from "@/features/workspace";

import type { InventoryCase } from "../types";

import {
  CASE_PAGE_SIZE,
  caseListQuery,
  casePageCount,
  decisionBody,
  decisionProblems,
  isDecidable,
  NEW_DECISION,
  proceedingChoices,
} from "./case-decision-form";
import { CASES_PATH } from "./intake-routes";
import { MANAGER_ROLES } from "./intake-viewer";

const property: InventoryCase = {
  caseId: "C1",
  status: "OPEN",
  version: 4,
  intake: { intakeId: "I1", leadCode: "R-1" },
  candidate: { kind: "PROPERTY", code: "SV-1", intakeId: null },
};
const intakes: InventoryCase = { ...property, candidate: { kind: "INTAKE", code: "R-2", intakeId: "I2" } };

describe("the decision form", () => {
  it("case_decisionForm_rules: wants an outcome and a basis", () => {
    expect(decisionProblems(NEW_DECISION, property)).toEqual({ outcome: "required", basis: "required" });
  });

  it("case_decisionForm_rules: different assets need nothing more", () => {
    expect(decisionProblems({ ...NEW_DECISION, outcome: "DIFFERENT_ASSET", basis: "Other house" }, intakes)).toEqual({});
  });

  it("case_decisionForm_rules: the same asset on a property names no intake", () => {
    const form = { ...NEW_DECISION, outcome: "SAME_ASSET" as const, basis: "Same house" };
    expect(decisionProblems(form, property)).toEqual({});
    expect(decisionBody({ ...form, proceedingIntakeId: "I1" }, property)).toEqual({ outcome: "SAME_ASSET", basis: "Same house", expectedVersion: 4 });
  });

  it("case_decisionForm_rules: the same asset between two intakes names the one that goes on, one of the two", () => {
    const form = { ...NEW_DECISION, outcome: "SAME_ASSET" as const, basis: "Same house" };
    expect(decisionProblems(form, intakes)).toEqual({ proceeding: "required" });
    expect(decisionProblems({ ...form, proceedingIntakeId: "OTHER" }, intakes)).toEqual({ proceeding: "required" });
    expect(decisionProblems({ ...form, proceedingIntakeId: "I2" }, intakes)).toEqual({});
    expect(decisionBody({ ...form, proceedingIntakeId: "I2" }, intakes)).toEqual({
      outcome: "SAME_ASSET",
      proceedingIntakeId: "I2",
      basis: "Same house",
      expectedVersion: 4,
    });
  });

  it("case_decisionForm_rules: different assets send no intake, even if one was picked first", () => {
    expect(decisionBody({ outcome: "DIFFERENT_ASSET", proceedingIntakeId: "I2", basis: " Other " }, intakes)).toEqual({
      outcome: "DIFFERENT_ASSET",
      basis: "Other",
      expectedVersion: 4,
    });
  });

  it("case_decisionForm_rules: offers the two sides only for two intakes", () => {
    expect(proceedingChoices(property)).toEqual([]);
    expect(proceedingChoices(intakes)).toEqual([
      { intakeId: "I1", code: "R-1" },
      { intakeId: "I2", code: "R-2" },
    ]);
  });

  it("case_decisionForm_rules: only an open case can be decided", () => {
    expect(isDecidable(property)).toBe(true);
    expect(isDecidable({ ...property, status: "DECIDED" })).toBe(false);
    expect(isDecidable({ ...property, status: "CLOSED" })).toBe(false);
  });

  it("case_decisionForm_rules: refuses a phone number in the basis", () => {
    expect(decisionProblems({ ...NEW_DECISION, outcome: "DIFFERENT_ASSET", basis: "Called 0901234567" }, property)).toEqual({ basis: "phone" });
  });
});

describe("the case list", () => {
  it("case_listPagedAndFiltered: asks for one status and one page of twenty", () => {
    expect(CASE_PAGE_SIZE).toBe(20);
    expect(caseListQuery("OPEN", 0)).toEqual({ status: "OPEN", page: 0, size: 20 });
    expect(caseListQuery("DECIDED", 2)).toEqual({ status: "DECIDED", page: 2, size: 20 });
  });

  it("case_listPagedAndFiltered: counts pages from what the server left after its filter", () => {
    expect(casePageCount({ totalElements: 0 })).toBe(0);
    expect(casePageCount({ totalElements: 20 })).toBe(1);
    expect(casePageCount({ totalElements: 21 })).toBe(2);
    expect(casePageCount({})).toBe(0);
  });

  it("names the same path and roles as the workspace menu", () => {
    expect(CASES_PATH).toBe(INVENTORY_CASES_PATH);
    expect(MANAGER_ROLES).toEqual(INVENTORY_CASE_ROLES);
  });
});
