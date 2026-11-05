import { callApi, type ApiResult } from "@/features/auth/client";

import type {
  ChecklistCheckpoint,
  ChecklistDecided,
  ChecklistDecisionInput,
  ChecklistGroupPath,
  ChecklistRequalificationInput,
  ChecklistRequalified,
  ChecklistReviewQueue,
  ChecklistReviewQueueQuery,
  ChecklistRevisionInput,
  ChecklistRevisionStarted,
  ChecklistSaveBody,
  ChecklistStarted,
  ChecklistStartInput,
  ChecklistSubmitInput,
  ChecklistSubmitted,
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
 * POST /api/v1/staff/survey-checklists/{checklistId}/submission. A repeat by the same caller answers 200 with
 * `historyEntry: null` (A-4): that is a success too.
 */
export function submitChecklist(
  checklistId: string,
  input: ChecklistSubmitInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistSubmitted>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/submission", {
      params: { path: { checklistId } },
      body: input,
    }),
  );
}

/**
 * POST /api/v1/staff/survey-checklists/{checklistId}/decision. The decision commits before its answer is built (spec
 * 9.5): after a 5xx or 409 read the checklist again before showing an error.
 */
export function decideChecklist(
  checklistId: string,
  input: ChecklistDecisionInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistDecided>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/decision", {
      params: { path: { checklistId } },
      body: input,
    }),
  );
}

/**
 * POST /api/v1/staff/survey-checklists/{checklistId}/requalification, on the revision and version the survey block's
 * `survey.requalification` names. The mark commits before its answer is built (property-create requalification spec
 * 5.3), and the answer is not a `SurveyCommandResult`: read the lead and its survey block again after it.
 */
export function requalifyChecklist(
  checklistId: string,
  input: ChecklistRequalificationInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistRequalified>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/requalification", {
      params: { path: { checklistId } },
      body: input,
    }),
  );
}

/**
 * POST /api/v1/staff/survey-checklists/{checklistId}/revisions (201), on the revision the survey block's `revisionStart`
 * names. `intake` is always sent: null for the previous holder, the declaration for anyone else (A-7).
 */
export function startRevision(
  checklistId: string,
  input: ChecklistRevisionInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistRevisionStarted>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-checklists/{checklistId}/revisions", {
      params: { path: { checklistId } },
      body: input,
    }),
  );
}

/** GET /api/v1/staff/survey-checklists/review-queue: read fresh per call and without a read budget, so never polled. */
export function getReviewQueue(
  query: ChecklistReviewQueueQuery,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<ChecklistReviewQueue>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/survey-checklists/review-queue", { params: { query } }));
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
