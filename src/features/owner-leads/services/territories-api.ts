import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type { Territory } from "../types";

import { PROVINCE_CODE } from "./owner-leads-api";

/** Signed-in calls go through `callApi` (Bearer from memory); tests pass a fake. */
export type TerritoriesDeps = { callApi: CallApi };

const DEFAULT_DEPS: TerritoriesDeps = { callApi };

/** GET /api/v1/staff/sale-territories?provinceCode=48 (ADMIN): every ward and who looks after it. */
export function listTerritories(deps: TerritoriesDeps = DEFAULT_DEPS): Promise<ApiResult<Territory[]>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/sale-territories", { params: { query: { provinceCode: PROVINCE_CODE } } }),
  );
}

/** PUT /api/v1/staff/sale-territories/{wardCode}: replaces whoever had the ward. */
export function assignTerritory(
  wardCode: string,
  userId: string,
  deps: TerritoriesDeps = DEFAULT_DEPS,
): Promise<ApiResult<Territory>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/sale-territories/{wardCode}", { params: { path: { wardCode } }, body: { userId } }),
  );
}

/** DELETE /api/v1/staff/sale-territories/{wardCode}: 204, also when nobody had the ward. */
export function unassignTerritory(wardCode: string, deps: TerritoriesDeps = DEFAULT_DEPS): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.DELETE("/api/v1/staff/sale-territories/{wardCode}", { params: { path: { wardCode } } }),
  );
}
