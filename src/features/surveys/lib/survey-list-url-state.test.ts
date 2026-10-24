import { describe, expect, it } from "vitest";

import { viewerOf } from "@/features/workspace";

import {
  parseSurveyListState,
  serializeSurveyListState,
  SURVEY_PAGE_SIZE,
  toSurveyApiQuery,
  withSurveyFilter,
} from "./survey-list-url-state";

const q = (s: string) => new URLSearchParams(s);
const sale = viewerOf(["SALE"]);
const leader = viewerOf(["SALE_LEADER"]);
const manager = viewerOf(["SALES_MANAGER"]);

describe("parseSurveyListState (spec 6.5: tabs as the lead tabs)", () => {
  it("keeps a SALE on My Surveys, whatever the URL says, and drops the surveyor", () => {
    for (const query of ["", "scope=all", "scope=all&surveyor=U1", "scope=x", "surveyor=U1"]) {
      expect(parseSurveyListState(q(query), sale)).toEqual({ scope: "mine", page: 1 });
    }
  });

  it("starts managers on All Surveys; a leader may open My Surveys, a sales manager may not", () => {
    expect(parseSurveyListState(q(""), leader)).toEqual({ scope: "all", page: 1 });
    expect(parseSurveyListState(q("scope=mine"), leader)).toEqual({ scope: "mine", page: 1 });
    expect(parseSurveyListState(q("scope=mine"), manager)).toEqual({ scope: "all", page: 1 });
  });

  it("keeps a valid surveyor and page on All Surveys only", () => {
    expect(parseSurveyListState(q("scope=all&surveyor=U1&page=3"), leader)).toEqual({ scope: "all", surveyor: "U1", page: 3 });
    expect(parseSurveyListState(q("scope=mine&surveyor=U1"), leader)).toEqual({ scope: "mine", page: 1 });
    expect(parseSurveyListState(q("scope=all&surveyor=a%20b&page=0"), leader)).toEqual({ scope: "all", page: 1 });
  });
});

describe("serializeSurveyListState", () => {
  it("writes the scope always, the surveyor and a page above 1 when set", () => {
    expect(serializeSurveyListState({ scope: "mine", page: 1 })).toBe("scope=mine");
    expect(serializeSurveyListState({ scope: "all", surveyor: "U1", page: 2 })).toBe("scope=all&surveyor=U1&page=2");
  });

  it("round-trips a parsed state", () => {
    const state = parseSurveyListState(q("scope=all&surveyor=U1&page=2"), leader);
    expect(parseSurveyListState(q(serializeSurveyListState(state)), leader)).toEqual(state);
  });
});

describe("toSurveyApiQuery (spec 7.1)", () => {
  it("sends surveyorUserId only with all, a zero-based page and size 20", () => {
    expect(toSurveyApiQuery({ scope: "mine", page: 1 })).toEqual({ scope: "mine", page: 0, size: SURVEY_PAGE_SIZE });
    expect(toSurveyApiQuery({ scope: "all", surveyor: "U1", page: 3 })).toEqual({
      scope: "all",
      surveyorUserId: "U1",
      page: 2,
      size: 20,
    });
  });
});

describe("withSurveyFilter", () => {
  it("resets the page, and a tab switch drops the surveyor", () => {
    expect(withSurveyFilter({ scope: "all", surveyor: "U1", page: 3 }, { surveyor: "U2" })).toEqual({
      scope: "all",
      surveyor: "U2",
      page: 1,
    });
    expect(withSurveyFilter({ scope: "all", surveyor: "U1", page: 3 }, { scope: "mine" })).toEqual({ scope: "mine", page: 1 });
    expect(withSurveyFilter({ scope: "all", surveyor: "U1", page: 3 }, { surveyor: null })).toEqual({ scope: "all", page: 1 });
  });
});
