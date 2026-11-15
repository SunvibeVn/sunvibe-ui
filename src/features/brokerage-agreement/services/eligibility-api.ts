import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type { BrokerageEligibility } from "../types";

export type EligibilityDeps = { callApi: CallApi };

const DEFAULT_DEPS: EligibilityDeps = { callApi };

/** GET whether each unit of the lead's latest completed intake can get an agreement (brokerage-agreement US-1). */
export function getEligibility(
  leadId: string,
  deps: EligibilityDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageEligibility>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/brokerage-eligibility", { params: { path: { leadId } } }),
  );
}
