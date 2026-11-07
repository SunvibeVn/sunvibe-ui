import { describe, expect, it } from "vitest";

import { viewerOf } from "@/features/workspace";
import { nextListState } from "@/lib/use-url-list";

import {
  parseSurveyListState,
  serializeSurveyListState,
  SURVEY_PAGE_SIZE,
  toReviewQueueQuery,
  toSurveyApiQuery,
  withReviewsTab,
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

describe("the Reviews tab in the URL (survey-checklist submission A-9)", () => {
  it("reads tab=reviews and drops the surveyor there", () => {
    expect(parseSurveyListState(q("scope=all&tab=reviews&surveyor=U1&page=2"), leader)).toEqual({ scope: "all", tab: "reviews", page: 2 });
    expect(parseSurveyListState(q("tab=reviews"), sale)).toEqual({ scope: "mine", tab: "reviews", page: 1 });
  });

  it("ignores any other tab", () => {
    expect(parseSurveyListState(q("scope=mine&tab=other"), sale)).toEqual({ scope: "mine", page: 1 });
  });

  it("writes the tab and round-trips", () => {
    const state = parseSurveyListState(q("scope=all&tab=reviews&page=3"), leader);
    expect(serializeSurveyListState(state)).toBe("scope=all&tab=reviews&page=3");
    expect(parseSurveyListState(q(serializeSurveyListState(state)), leader)).toEqual(state);
  });

  it("opens the tab on its first page, without the surveyor", () => {
    expect(withReviewsTab({ scope: "all", surveyor: "U1", page: 4 })).toEqual({ scope: "all", tab: "reviews", page: 1 });
  });

  it("leaves the tab for a list tab", () => {
    expect(withSurveyFilter({ scope: "all", tab: "reviews", page: 2 }, { scope: "mine" })).toEqual({ scope: "mine", page: 1 });
    expect(withSurveyFilter({ scope: "all", tab: "reviews", page: 2 }, { scope: "all" })).toEqual({ scope: "all", page: 1 });
  });

  it("asks the queue for a zero-based page of 20", () => {
    expect(toReviewQueueQuery({ scope: "mine", tab: "reviews", page: 3 })).toEqual({ page: 2, size: SURVEY_PAGE_SIZE });
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

describe("a surveyor change of useUrlList", () => {
  it("surveyorChange_aSale_staysOnMine: a SALE never reaches a URL with scope all (spec 6.5)", () => {
    const url = { parse: (params: URLSearchParams) => parseSurveyListState(params, sale), serialize: serializeSurveyListState };
    const state = parseSurveyListState(q("scope=mine"), sale);
    for (const change of [{ scope: "all" as const }, { surveyor: "U1" }, { scope: "all" as const, surveyor: "U1" }]) {
      expect(serializeSurveyListState(nextListState(withSurveyFilter(state, change), url))).toBe("scope=mine");
    }
  });

  const url = { parse: (params: URLSearchParams) => parseSurveyListState(params, leader), serialize: serializeSurveyListState };

  it.each(["scope=all", "scope=all&surveyor=U1", "scope=all&surveyor=U1&page=3"])(
    "surveyorChange_sameUrlAsWithSurveyFilter: %s",
    (query) => {
      const state = parseSurveyListState(q(query), leader);
      for (const surveyor of ["U2", null]) {
        const changed = withSurveyFilter(state, { surveyor });
        expect(serializeSurveyListState(nextListState(changed, url))).toBe(serializeSurveyListState(changed));
      }
    },
  );
});
