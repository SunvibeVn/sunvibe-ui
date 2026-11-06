import { callApi, type ApiResult } from "@/features/auth/client";

import type { CaseDecisionInput, InventoryCase, InventoryCasePage } from "../types";

import type { IntakeDeps } from "./intake-api";

const DEFAULT_DEPS: IntakeDeps = { callApi };

export type CaseListQuery = { status: "OPEN" | "DECIDED"; page: number; size: number };

/** GET the cases: whoever worked a side does not see one, and `totalElements` counts after that filter (spec 4.3). */
export function listCases(query: CaseListQuery, deps: IntakeDeps = DEFAULT_DEPS): Promise<ApiResult<InventoryCasePage>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/inventory-cases", { params: { query } }));
}

/** GET one case; the server writes an access log row (spec 4.12). */
export function getCase(caseId: string, deps: IntakeDeps = DEFAULT_DEPS): Promise<ApiResult<InventoryCase>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/inventory-cases/{caseId}", { params: { path: { caseId } } }),
  );
}

export function decideCase(
  caseId: string,
  input: CaseDecisionInput,
  deps: IntakeDeps = DEFAULT_DEPS,
): Promise<ApiResult<InventoryCase>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/inventory-cases/{caseId}/decision", { params: { path: { caseId } }, body: input }),
  );
}
