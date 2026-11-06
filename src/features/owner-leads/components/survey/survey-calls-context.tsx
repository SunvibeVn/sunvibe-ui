"use client";

import { createContext, useContext } from "react";
import type { ApiResult } from "@/features/auth/client";
import type { Ward } from "@/features/lead-shared";
import type { SurveyBlock } from "@/features/surveys";
import type { PublicApiResult } from "@/lib/api";

/** The calls of the lead feature that the survey UI uses and never imports: the lead feature passes them in. */
export type SurveyCalls = {
  /** The survey block of a lead. Every read writes an access-log row, so overlapping reads share one request. */
  getLeadSurvey(leadId: string, userId: string): Promise<ApiResult<SurveyBlock>>;
  /** The wards of the catalog. Never throws. */
  listWards(): Promise<PublicApiResult<Ward[]>>;
};

const SurveyCallsContext = createContext<SurveyCalls | null>(null);

export const SurveyCallsProvider = SurveyCallsContext.Provider;

export function useSurveyCalls(): SurveyCalls {
  const calls = useContext(SurveyCallsContext);
  if (calls === null) throw new Error("useSurveyCalls must be used inside SurveyCallsProvider");
  return calls;
}
