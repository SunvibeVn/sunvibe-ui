import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type {
  BookSurveyInput,
  CancelAppointmentInput,
  ChangeAppointmentInput,
  OverlapQuery,
  RecordVisitInput,
  ResumeSurveyInput,
  SetConfirmationInput,
  SurveyBlock,
  SurveyCommandResult,
  SurveyListQuery,
  SurveyOverlaps,
  SurveyPage,
  Surveyor,
} from "../types";

/** Signed-in calls go through `callApi` (Bearer from memory); tests pass a fake. */
export type SurveysDeps = { callApi: CallApi };

const DEFAULT_DEPS: SurveysDeps = { callApi };

/** GET /api/v1/staff/survey-appointments. A SALE never sends `all`: build the query from the parsed URL state. */
export function listSurveys(query: SurveyListQuery, deps: SurveysDeps = DEFAULT_DEPS): Promise<ApiResult<SurveyPage>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/survey-appointments", { params: { query } }));
}

/** GET /api/v1/staff/owner-lead-assignees: the staff who can hold leads, i.e. be a surveyor (the Surveyor filter). */
export function listSurveyors(deps: SurveysDeps = DEFAULT_DEPS): Promise<ApiResult<Surveyor[]>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/owner-lead-assignees"));
}

/** GET /api/v1/staff/owner-leads/{leadId}/survey. The server writes one survey access-log row per read (A-13). */
export function getSurvey(leadId: string, deps: SurveysDeps = DEFAULT_DEPS): Promise<ApiResult<SurveyBlock>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/survey", { params: { path: { leadId } } }),
  );
}

/** GET /api/v1/staff/owner-leads/{leadId}/survey-overlaps: the surveyor's appointments that overlap (A-10). */
export function checkOverlaps(
  leadId: string,
  query: OverlapQuery,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyOverlaps>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/owner-leads/{leadId}/survey-overlaps", { params: { path: { leadId }, query } }),
  );
}

/** POST /api/v1/staff/owner-leads/{leadId}/survey-appointments (201). */
export function bookSurvey(
  leadId: string,
  input: BookSurveyInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/survey-appointments", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}

/** POST /api/v1/staff/survey-appointments/{appointmentId}/changes; every key of the body is present (A-4). */
export function changeAppointment(
  appointmentId: string,
  input: ChangeAppointmentInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-appointments/{appointmentId}/changes", {
      params: { path: { appointmentId } },
      body: input,
    }),
  );
}

/** POST /api/v1/staff/survey-appointments/{appointmentId}/confirmation: confirm or remove the confirmation. */
export function setConfirmation(
  appointmentId: string,
  input: SetConfirmationInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-appointments/{appointmentId}/confirmation", {
      params: { path: { appointmentId } },
      body: input,
    }),
  );
}

/** POST /api/v1/staff/survey-appointments/{appointmentId}/cancellation. */
export function cancelAppointment(
  appointmentId: string,
  input: CancelAppointmentInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-appointments/{appointmentId}/cancellation", {
      params: { path: { appointmentId } },
      body: input,
    }),
  );
}

/** POST /api/v1/staff/survey-appointments/{appointmentId}/visit; `proxy` for every record but the surveyor's own. */
export function recordVisit(
  appointmentId: string,
  input: RecordVisitInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/survey-appointments/{appointmentId}/visit", {
      params: { path: { appointmentId } },
      body: input,
    }),
  );
}

/** POST /api/v1/staff/owner-leads/{leadId}/survey-resumptions (201): ON_HOLD back to SURVEY_SCHEDULED (BR-11). */
export function resumeSurvey(
  leadId: string,
  input: ResumeSurveyInput,
  deps: SurveysDeps = DEFAULT_DEPS,
): Promise<ApiResult<SurveyCommandResult>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/owner-leads/{leadId}/survey-resumptions", {
      params: { path: { leadId } },
      body: input,
    }),
  );
}
