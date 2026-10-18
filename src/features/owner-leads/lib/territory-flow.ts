import type { ApiResult } from "@/features/auth/client";

import { assignTerritory, unassignTerritory } from "../services/territories-api";
import type { Territory } from "../types";

import { toLeadUiError } from "./lead-ui-error";
import { type TerritoryProblem, territoryProblem } from "./territory-flags";

export type TerritoryFlowDeps = {
  assignTerritory(wardCode: string, userId: string): Promise<ApiResult<Territory>>;
  unassignTerritory(wardCode: string): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: TerritoryFlowDeps = {
  assignTerritory: (wardCode, userId) => assignTerritory(wardCode, userId),
  unassignTerritory: (wardCode) => unassignTerritory(wardCode),
};

/** Success kind follows the request (a removal is `userId === null`), never the shape of the answer body. */
export type TerritoryOutcome =
  | { ok: true; kind: "removed" }
  | { ok: true; kind: "saved"; saved: Territory }
  | { ok: false; problem: TerritoryProblem };

/** Sends a change (`userId`) or a removal (null) for a ward and maps a failure to what the page shows (spec 5.2). */
export async function sendTerritoryChange(
  wardCode: string,
  userId: string | null,
  deps: TerritoryFlowDeps = DEFAULT_DEPS,
): Promise<TerritoryOutcome> {
  if (userId === null) {
    const removed = await deps.unassignTerritory(wardCode);
    return removed.ok
      ? { ok: true, kind: "removed" }
      : { ok: false, problem: territoryProblem(toLeadUiError(removed) ?? { kind: "retry" }) };
  }
  const changed = await deps.assignTerritory(wardCode, userId);
  return changed.ok
    ? { ok: true, kind: "saved", saved: changed.data }
    : { ok: false, problem: territoryProblem(toLeadUiError(changed) ?? { kind: "retry" }) };
}
