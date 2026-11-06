"use client";

import type { ReactNode } from "react";

import { getLeadSurvey, listWards } from "../services/owner-leads-api";

import { type SurveyCalls, SurveyCallsProvider } from "./survey/survey-calls-context";

const CALLS: SurveyCalls = { getLeadSurvey, listWards };

/**
 * Passes the survey UI the calls that stay in this feature. The checklist route needs it as a component: a Server
 * Component cannot hand a function to a Client Component.
 */
export function LeadSurveyContext({ children }: { children: ReactNode }) {
  return <SurveyCallsProvider value={CALLS}>{children}</SurveyCallsProvider>;
}
