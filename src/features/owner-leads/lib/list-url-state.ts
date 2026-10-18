import { CLOSED_STATUSES, LEAD_STATUSES, OPEN_STATUSES, type LeadStatus } from "../types";
import type { Scope, Viewer } from "./viewer";

export type { Scope } from "./viewer";

/** The lead list route. */
export const LIST_PATH = "/workspace/owner-leads";

/** Leads per page of the list (C-25). */
export const LIST_PAGE_SIZE = 20;

/**
 * The lead list as the URL describes it (spec 5.3). `statuses` is the effective status filter, always in the
 * canonical order of `LEAD_STATUSES`; `page` is 1-based.
 */
export type ListState = {
  scope: Scope;
  statuses: LeadStatus[];
  /** "Hiện cả lead đã đóng" (C-26); only meaningful while `statuses` is the default set. */
  includeClosed: boolean;
  /** Ward code; kept on "all" only. */
  ward?: string;
  /** Assignee user id; kept on "all" only. */
  assignee?: string;
  page: number;
};

/** Query of `GET /api/v1/staff/owner-leads`. Empty values are never set (the API rejects them, handoff 2). */
export type ListApiQuery = {
  scope: Scope;
  status?: LeadStatus[];
  wardCode?: string;
  assigneeUserId?: string;
  /** Zero-based. */
  page: number;
  size: typeof LIST_PAGE_SIZE;
};

/** Any change of tab or filter; `page` is always reset to 1. */
export type ListFilterChange = Partial<Omit<ListState, "page">>;

const SCOPES: readonly Scope[] = ["mine", "unassigned", "all"];
const WARD_CODE = /^[0-9]{1,10}$/;
const USER_ID = /^[A-Za-z0-9]{1,26}$/;
const PAGE = /^[1-9][0-9]*$/;

function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/** Status and closed filters are kept on "mine" and "all"; "unassigned" is always NEW (the API forces it). */
function keepsStatus(scope: Scope): boolean {
  return scope !== "unassigned";
}

/** Ward and assignee filters are kept on "all" only. */
function keepsWardAndAssignee(scope: Scope): boolean {
  return scope === "all";
}

function defaultStatuses(includeClosed: boolean): LeadStatus[] {
  return includeClosed ? [...OPEN_STATUSES, ...CLOSED_STATUSES] : [...OPEN_STATUSES];
}

function sameStatuses(a: readonly LeadStatus[], b: readonly LeadStatus[]): boolean {
  return a.length === b.length && a.every((status, index) => status === b[index]);
}

/** W9 statuses only, deduplicated, in canonical order. */
function canonicalStatuses(values: readonly unknown[]): LeadStatus[] {
  return LEAD_STATUSES.filter((status) => values.includes(status));
}

/**
 * Statuses and closed flag for `scope`. No valid status → the default set (open, or open + closed); an explicit pick
 * wins over the closed flag (W11-25), and a pick equal to the default set keeps the flag so the URL stays short.
 */
function resolveStatuses(
  scope: Scope,
  picked: readonly unknown[],
  includeClosed: boolean,
): Pick<ListState, "statuses" | "includeClosed"> {
  if (!keepsStatus(scope)) return { statuses: defaultStatuses(false), includeClosed: false };
  const statuses = canonicalStatuses(picked);
  if (statuses.length === 0 || sameStatuses(statuses, defaultStatuses(includeClosed))) {
    return { statuses: defaultStatuses(includeClosed), includeClosed };
  }
  return { statuses, includeClosed: false };
}

function validWard(value: unknown): string | undefined {
  return typeof value === "string" && WARD_CODE.test(value) ? value : undefined;
}

function validAssignee(value: unknown): string | undefined {
  return typeof value === "string" && USER_ID.test(value) ? value : undefined;
}

function validPage(value: unknown): number {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 1 ? value : 1;
  if (typeof value !== "string" || !PAGE.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

/** Builds a normalized state: every value valid and allowed for its scope, no empty optional field. */
function build(
  scope: Scope,
  picked: readonly unknown[],
  includeClosed: boolean,
  ward: unknown,
  assignee: unknown,
  page: unknown,
): ListState {
  const state: ListState = { scope, ...resolveStatuses(scope, picked, includeClosed), page: validPage(page) };
  if (keepsWardAndAssignee(scope)) {
    const wardCode = validWard(ward);
    const userId = validAssignee(assignee);
    if (wardCode !== undefined) state.ward = wardCode;
    if (userId !== undefined) state.assignee = userId;
  }
  return state;
}

/**
 * Reads the list URL for `viewer` (spec 5.3 table). A scope the viewer may not open becomes the default tab, so a
 * SALE always gets "mine"; invalid values and values the scope does not keep are dropped. Run it before any call and
 * `router.replace` the URL with `serializeListState` of the result when it differs (W11-23).
 */
export function parseListState(params: URLSearchParams, viewer: Viewer): ListState {
  const rawScope = params.get("scope");
  const scope = isScope(rawScope) && viewer.tabs.includes(rawScope) ? rawScope : viewer.defaultScope;
  return build(
    scope,
    params.getAll("status"),
    params.get("closed") === "1",
    params.get("ward"),
    params.get("assignee"),
    params.get("page"),
  );
}

/**
 * The query string (without `?`) for `state`. `scope` is always written; the default status set, page 1 and values the
 * scope does not keep are left out. `parseListState(serializeListState(s))` gives `s` back for a normalized state.
 */
export function serializeListState(state: ListState): string {
  const normalized = build(
    state.scope,
    state.statuses,
    state.includeClosed,
    state.ward,
    state.assignee,
    state.page,
  );
  const params = new URLSearchParams({ scope: normalized.scope });
  if (keepsStatus(normalized.scope)) {
    if (!sameStatuses(normalized.statuses, defaultStatuses(normalized.includeClosed))) {
      for (const status of normalized.statuses) params.append("status", status);
    } else if (normalized.includeClosed) {
      params.set("closed", "1");
    }
  }
  if (normalized.ward !== undefined) params.set("ward", normalized.ward);
  if (normalized.assignee !== undefined) params.set("assignee", normalized.assignee);
  if (normalized.page > 1) params.set("page", String(normalized.page));
  return params.toString();
}

/**
 * The statuses the user picked on a tab that keeps statuses: empty while the list shows its default set (open, or
 * open + closed when `includeClosed`). A pick that lists all seven statuses without "closed" is a real pick.
 */
export function pickedStatuses(state: ListState): LeadStatus[] {
  if (!keepsStatus(state.scope)) return [];
  return sameStatuses(state.statuses, defaultStatuses(state.includeClosed)) ? [] : [...state.statuses];
}

/** True when the list is narrowed by anything beyond its default open set (drives "Xóa bộ lọc"). */
export function hasActiveFilter(state: ListState): boolean {
  return (
    pickedStatuses(state).length > 0 ||
    state.includeClosed ||
    state.ward !== undefined ||
    state.assignee !== undefined
  );
}

/**
 * The list API query for `state`. Never an empty value, never `status` on "unassigned", never `wardCode` or
 * `assigneeUserId` outside "all"; `page` is zero-based, size 20. It does not check the viewer: build `state` with
 * `parseListState` so a SALE never gets a scope other than "mine".
 */
export function toApiQuery(state: ListState): ListApiQuery {
  const normalized = build(
    state.scope,
    state.statuses,
    state.includeClosed,
    state.ward,
    state.assignee,
    state.page,
  );
  const query: ListApiQuery = { scope: normalized.scope, page: normalized.page - 1, size: LIST_PAGE_SIZE };
  if (keepsStatus(normalized.scope)) query.status = normalized.statuses;
  if (normalized.ward !== undefined) query.wardCode = normalized.ward;
  if (normalized.assignee !== undefined) query.assigneeUserId = normalized.assignee;
  return query;
}

/**
 * `state` with `change` applied and `page` reset to 1 (spec 5.3). Ticking "closed" without new statuses resets the
 * statuses to the default set; picking statuses clears "closed" unless the pick is the default set; an empty pick
 * means the default set. Values the new scope does not keep are dropped. The input is not changed.
 */
export function withFilter(state: ListState, change: ListFilterChange): ListState {
  const merged = { ...state, ...change };
  const pickedOnly = change.statuses !== undefined && change.includeClosed === undefined;
  const closedOnly = change.includeClosed !== undefined && change.statuses === undefined;
  const includeClosed = pickedOnly ? false : merged.includeClosed;
  const picked = closedOnly ? [] : merged.statuses;
  return build(merged.scope, picked, includeClosed, merged.ward, merged.assignee, 1);
}
