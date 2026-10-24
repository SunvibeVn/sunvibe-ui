import { describe, expect, it } from "vitest";

import { groupSurveyRows, surveyLeadHref } from "./survey-groups";

describe("groupSurveyRows (spec 6.5, A-11: groups as headers in the API order)", () => {
  it("keeps the API order and starts a header at each new group", () => {
    const rows = [
      { id: "A", group: "OVERDUE" as const },
      { id: "B", group: "TODAY" as const },
      { id: "C", group: "TODAY" as const },
      { id: "D", group: "UPCOMING" as const },
    ];
    expect(groupSurveyRows(rows).map((section) => [section.group, section.items.map((item) => item.id)])).toEqual([
      ["OVERDUE", ["A"]],
      ["TODAY", ["B", "C"]],
      ["UPCOMING", ["D"]],
    ]);
  });

  it("puts a row with an unknown or missing group under Upcoming and skips null rows", () => {
    expect(groupSurveyRows([{ id: "A", group: null }, null]).map((section) => section.group)).toEqual(["UPCOMING"]);
    expect(groupSurveyRows([])).toEqual([]);
  });
});

describe("surveyLeadHref", () => {
  it("opens the lead detail at its Survey section", () => {
    expect(surveyLeadHref("01JE2EHEAD0000000000000011")).toBe("/workspace/owner-leads/01JE2EHEAD0000000000000011#survey");
    expect(surveyLeadHref("a/b")).toBe("/workspace/owner-leads/a%2Fb#survey");
  });
});
