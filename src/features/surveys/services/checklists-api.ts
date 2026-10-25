import { callApi, type ApiResult } from "@/features/auth/client";

import type {
  ChecklistCheckpoint,
  ChecklistGroupPath,
  ChecklistSaveBody,
  ChecklistStarted,
  ChecklistStartInput,
  ChecklistTakenOver,
  ChecklistTakeoverInput,
  ChecklistView,
} from "../types";

import type { SurveysDeps } from "./surveys-api";

const DEFAULT_DEPS: SurveysDeps = { callApi };

/**
 * POST /api/v1/staff/survey-appointments/{appointmentId}/checklists (201). `intake` is null for the visit's performer
 * and the declaration for anyone else (survey-checklist 4.5).
 */
export function startChecklist(
  appointmentId: string,
  input: ChecklistStartInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistStarted>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-appointments/{appointmentId}/checklists", {
      params: { path: { appointmentId } },
      body: input,
    }),
  );
}

/** GET /api/v1/staff/survey-checklists/{checklistId}; the server writes one access-log row per read (A-10). */
export function getChecklist(checklistId: string, deps: SurveysDeps = DEFAULT_DEPS): Promise<ApiResult<ChecklistView>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/survey-checklists/{checklistId}", { params: { path: { checklistId } } }),
  );
}

/** POST /api/v1/staff/survey-checklists/{checklistId}/takeovers (201): the new assignee becomes the holder (BR-14). */
export function takeOverChecklist(
  checklistId: string,
  input: ChecklistTakeoverInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistTakenOver>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/takeovers", {
      params: { path: { checklistId } },
      body: input,
    }),
  );
}

/** GET /api/v1/staff/survey-checklists/{checklistId}/takeovers/{takeoverNo}: the read-only checkpoint (W16-28). */
export function getCheckpoint(
  checklistId: string,
  takeoverNo: number,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistCheckpoint>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/survey-checklists/{checklistId}/takeovers/{takeoverNo}", {
      params: { path: { checklistId, takeoverNo } },
    }),
  );
}

/**
 * PUT /api/v1/staff/survey-checklists/{checklistId}/<group>. The body is sent as built: every input key present, no
 * `meta` or server field (A-4); the page builds it with `toGroupInput`.
 */
export function saveChecklistGroup<G extends ChecklistGroupPath>(
  checklistId: string,
  group: G,
  body: ChecklistSaveBody[G],
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistView>> {
  const params = { path: { checklistId } };
  return deps.callApi((client) => {
    switch (group) {
      case "identification":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/identification", {
          params,
          body: body as ChecklistSaveBody["identification"],
        });
      case "parts":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/parts", {
          params,
          body: body as ChecklistSaveBody["parts"],
        });
      case "dimensions":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/dimensions", {
          params,
          body: body as ChecklistSaveBody["dimensions"],
        });
      case "condition":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/condition", {
          params,
          body: body as ChecklistSaveBody["condition"],
        });
      case "safety":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/safety", {
          params,
          body: body as ChecklistSaveBody["safety"],
        });
      case "amenities":
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/amenities", {
          params,
          body: body as ChecklistSaveBody["amenities"],
        });
      default:
        return client.PUT("/api/v1/staff/survey-checklists/{checklistId}/terms", {
          params,
          body: body as ChecklistSaveBody["terms"],
        });
    }
  });
}
