import { type Scope, SURVEYS_PATH, type Viewer } from "@/features/workspace";

import type { SurveyListQuery } from "../types";

export { SURVEYS_PATH };

/** Appointments per page of the list (spec 7.1 default). */
export const SURVEY_PAGE_SIZE = 20;

/** The survey list as the URL describes it: the tab, the surveyor filter (All Surveys only) and a 1-based page. */
export type SurveyListState = { scope: Scope; surveyor?: string; page: number };

const USER_ID = /^[A-Za-z0-9]{1,26}$/;
const PAGE = /^[1-9][0-9]{0,5}$/;

const validSurveyor = (value: string | null): string | undefined =>
  value !== null && USER_ID.test(value) ? value : undefined;

/**
 * Reads the list URL for `viewer` (spec 6.5, the lead tabs' rules): a tab the viewer may not open becomes their
 * default, so a SALE always gets "mine" and never sends `scope=all`; the surveyor is kept on "all" only. Run it before
 * any call and replace the URL with `serializeSurveyListState` of the result when it differs.
 */
export function parseSurveyListState(params: URLSearchParams, viewer: Viewer): SurveyListState {
  const raw = params.get("scope");
  const scope: Scope = (raw === "mine" || raw === "all") && viewer.tabs.includes(raw) ? raw : viewer.defaultScope;
  const page = params.get("page");
  const state: SurveyListState = { scope, page: page !== null && PAGE.test(page) ? Number(page) : 1 };
  const surveyor = scope === "all" ? validSurveyor(params.get("surveyor")) : undefined;
  if (surveyor !== undefined) state.surveyor = surveyor;
  return state;
}

/** The query string (without `?`): the scope always, the surveyor and a page above 1 when set. */
export function serializeSurveyListState(state: SurveyListState): string {
  const params = new URLSearchParams({ scope: state.scope });
  if (state.scope === "all" && state.surveyor !== undefined) params.set("surveyor", state.surveyor);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** The list API query: `surveyorUserId` only with "all", a zero-based page, size 20. */
export function toSurveyApiQuery(state: SurveyListState): SurveyListQuery {
  const query: SurveyListQuery = { scope: state.scope, page: state.page - 1, size: SURVEY_PAGE_SIZE };
  if (state.scope === "all" && state.surveyor !== undefined) query.surveyorUserId = state.surveyor;
  return query;
}

/** A change of tab or surveyor; page 1. A tab switch drops the surveyor; `null` clears it. */
export function withSurveyFilter(
  state: SurveyListState,
  change: { scope?: Scope; surveyor?: string | null },
): SurveyListState {
  const scope = change.scope ?? state.scope;
  const next: SurveyListState = { scope, page: 1 };
  if (scope !== state.scope) return next;
  const surveyor = change.surveyor === undefined ? state.surveyor : validSurveyor(change.surveyor);
  if (scope === "all" && surveyor !== undefined) next.surveyor = surveyor;
  return next;
}
