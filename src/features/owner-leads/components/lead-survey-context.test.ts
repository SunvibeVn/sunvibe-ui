import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type SurveyCalls, useSurveyCalls } from "@/features/surveys/client";

import { getLeadSurvey, listWards } from "../services/owner-leads-api";

import { LeadSurveyContext } from "./lead-survey-context";

describe("the survey calls of a lead (W32 F1)", () => {
  it("leadSurveyContext_givesTheCallsOfThisFeature: the survey UI reads them, it never imports them", () => {
    let calls: SurveyCalls | null = null;
    function Reader() {
      calls = useSurveyCalls();
      return null;
    }
    renderToStaticMarkup(createElement(LeadSurveyContext, null, createElement(Reader)));
    expect(calls).toEqual({ getLeadSurvey, listWards });
  });

  it("useSurveyCalls_withoutTheContext_throws: a route that forgets it fails at once, not with an empty ward list", () => {
    function Reader() {
      useSurveyCalls();
      return null;
    }
    expect(() => renderToStaticMarkup(createElement(Reader))).toThrow("useSurveyCalls must be used inside");
  });
});
