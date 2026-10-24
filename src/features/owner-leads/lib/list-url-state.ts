import { CLOSED_STATUSES, LEAD_STATUSES, type LeadStatus } from "../types";
import type { Scope, Viewer } from "./viewer";

export type { Scope } from "./viewer";

/** The lead list route. */
export const LIST_PATH = "/workspace/owner-leads";

/** Leads per page of the list (C-25). */
export const LIST_PAGE_SIZE = 20;

/**
 * The lead list as the URL describes it (spec 5.3). `statuses` is the effective status filter: never empty, only the
 * boxes the tab shows, in the canonical order of `LEAD_STATUSES`; `page` is 1-based.
 */
export type ListState = {
  scope: Scope;
  statuses: LeadStatus[];
  /** Ward code; kept on "all" only. */
  ward?: string;
  /** Assignee user id; kept on "all" only. */
  assignee?: string;
  page: number;
};

/** Query of `GET /api/v1/staff/owner-leads`. Empty values are never set (the API rejects them, handoff 2). */
export type ListApiQuery = {
  scope: Scope;
  status: LeadStatus[];
  wardCode?: string;
  assigneeUserId?: string;
  /** Zero-based. */
  page: number;
  size: typeof LIST_PAGE_SIZE;
};

/**
 * A change of tab or filter; `page` is always reset to 1. `null` clears the ward or assignee, `undefined` leaves it.
 * An empty `statuses` means the default set.
 */
export type ListFilterChange = {
  scope?: Scope;
  statuses?: readonly LeadStatus[];
  ward?: string | null;
  assignee?: string | null;
};

/** How "Show closed leads" looks for a state (A-8). */
export type ClosedToggle = "checked" | "unchecked" | "mixed";

const SCOPES: readonly Scope[] = ["mine", "all"];
/** The W11 tab some bookmarks still name; the UI never writes it (A-7). */
const LEGACY_UNASSIGNED = "unassigned";
const WARD_CODE = /^[0-9]{1,10}$/;
const USER_ID = /^[A-Za-z0-9]{1,26}$/;
const PAGE = /^[1-9][0-9]*$/;
/**
 * "My Leads", and "All Leads" with an assignee, start on these: the open set without the hidden Unassigned (A-6),
 * Survey Scheduled included (survey-schedule C-3d).
 */
const OPEN_WITHOUT_NEW: readonly LeadStatus[] = ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"];

function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/** Unassigned (NEW) can never match "My Leads" or an assignee filter, so it is not offered there (C-45, A-6). */
function showsNew(scope: Scope, assignee?: string): boolean {
  return scope === "all" && assignee === undefined;
}

/** The status checkboxes of a tab, in C-45 order (spec 5.3 table). */
export function statusBoxes(scope: Scope, assignee?: string): LeadStatus[] {
  return showsNew(scope, assignee) ? [...LEAD_STATUSES] : LEAD_STATUSES.filter((status) => status !== "NEW");
}

/**
 * The statuses a tab starts on (spec 5.3 table): Unassigned on "All Leads", else Assigned, Contacted, Survey Scheduled,
 * On Hold.
 */
export function defaultStatuses(scope: Scope, assignee?: string): LeadStatus[] {
  return showsNew(scope, assignee) ? ["NEW"] : [...OPEN_WITHOUT_NEW];
}

function sameStatuses(a: readonly LeadStatus[], b: readonly LeadStatus[]): boolean {
  return a.length === b.length && a.every((status, index) => status === b[index]);
}

/** The statuses of `values` the tab shows, deduplicated, in canonical order; may be empty. */
function shownStatuses(values: readonly unknown[], scope: Scope, assignee?: string): LeadStatus[] {
  return statusBoxes(scope, assignee).filter((status) => values.includes(status));
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

/**
 * A normalized state: every value valid and allowed for its scope, no empty optional field, statuses limited to the
 * tab's boxes and the default set when none is left.
 */
function build(scope: Scope, picked: readonly unknown[], ward: unknown, assignee: unknown, page: unknown): ListState {
  const wardCode = scope === "all" ? validWard(ward) : undefined;
  const userId = scope === "all" ? validAssignee(assignee) : undefined;
  const statuses = shownStatuses(picked, scope, userId);
  const state: ListState = {
    scope,
    statuses: statuses.length > 0 ? statuses : defaultStatuses(scope, userId),
    page: validPage(page),
  };
  if (wardCode !== undefined) state.ward = wardCode;
  if (userId !== undefined) state.assignee = userId;
  return state;
}

function normalize(state: ListState): ListState {
  return build(state.scope, state.statuses, state.ward, state.assignee, state.page);
}

/**
 * Reads the list URL for `viewer` (spec 5.3 parse table, A-7). A scope the viewer may not open becomes the default tab,
 * so a SALE always gets "mine" (W11-23); statuses that tab does not show are dropped. The W11 `scope=unassigned` opens
 * "All Leads" with Unassigned only (ward kept). `closed=1` (W11) adds the three closed statuses to the tab's open
 * ones when no status of the URL is left; a status wins over it. Run it before any call and `router.replace` the URL
 * with `serializeListState` of the result when it differs (W11-23).
 */
export function parseListState(params: URLSearchParams, viewer: Viewer): ListState {
  const rawScope = params.get("scope");
  const ward = params.get("ward");
  const page = params.get("page");
  if (rawScope === LEGACY_UNASSIGNED) {
    return viewer.tabs.includes("all")
      ? build("all", ["NEW"], ward, undefined, page)
      : build(viewer.defaultScope, [], ward, undefined, page);
  }
  const scope = isScope(rawScope) && viewer.tabs.includes(rawScope) ? rawScope : viewer.defaultScope;
  const assignee = scope === "all" ? validAssignee(params.get("assignee")) : undefined;
  let picked: LeadStatus[] = shownStatuses(params.getAll("status"), scope, assignee);
  if (picked.length === 0 && params.get("closed") === "1") {
    const open = statusBoxes(scope, assignee).filter((status) => !(CLOSED_STATUSES as readonly string[]).includes(status));
    picked = [...open, ...CLOSED_STATUSES];
  }
  return build(scope, picked, ward, assignee, page);
}

/**
 * The query string (without `?`) for `state`. `scope` is always written; the tab's default status set, page 1 and
 * values the scope does not keep are left out, and `closed` is never written. `parseListState(serializeListState(s))`
 * gives `s` back for a normalized state.
 */
export function serializeListState(state: ListState): string {
  const normalized = normalize(state);
  const params = new URLSearchParams({ scope: normalized.scope });
  if (!sameStatuses(normalized.statuses, defaultStatuses(normalized.scope, normalized.assignee))) {
    for (const status of normalized.statuses) params.append("status", status);
  }
  if (normalized.ward !== undefined) params.set("ward", normalized.ward);
  if (normalized.assignee !== undefined) params.set("assignee", normalized.assignee);
  if (normalized.page > 1) params.set("page", String(normalized.page));
  return params.toString();
}

/** True when the list is narrowed beyond the tab's default (drives "Clear filters"). */
export function hasActiveFilter(state: ListState): boolean {
  return (
    !sameStatuses(state.statuses, defaultStatuses(state.scope, state.assignee)) ||
    state.ward !== undefined ||
    state.assignee !== undefined
  );
}

/**
 * The list API query for `state`: `scope` and the full status set always (`scope=all&status=NEW` for the leader
 * default), never an empty value, never `wardCode` or `assigneeUserId` outside "all"; `page` is zero-based, size 20.
 * It does not check the viewer: build `state` with `parseListState` so a SALE never gets a scope other than "mine".
 */
export function toApiQuery(state: ListState): ListApiQuery {
  const normalized = normalize(state);
  const query: ListApiQuery = {
    scope: normalized.scope,
    status: normalized.statuses,
    page: normalized.page - 1,
    size: LIST_PAGE_SIZE,
  };
  if (normalized.ward !== undefined) query.wardCode = normalized.ward;
  if (normalized.assignee !== undefined) query.assigneeUserId = normalized.assignee;
  return query;
}

/**
 * `state` with `change` applied and `page` reset to 1 (spec 5.3 rules). A tab switch resets the statuses to the
 * target tab's default and drops ward and assignee. Setting an assignee turns the no-assignee default into the
 * assignee default, else drops Unassigned from the set; clearing it turns the assignee default back into the
 * no-assignee default, else keeps the set. An assignee that is not a plain id clears it. An explicit `statuses` is
 * applied last. The input is not changed.
 */
export function withFilter(state: ListState, change: ListFilterChange): ListState {
  let next: ListState = normalize(state);
  if (change.scope !== undefined && change.scope !== next.scope) {
    next = { scope: change.scope, statuses: defaultStatuses(change.scope), page: 1 };
  }
  if (change.ward !== undefined) {
    next = build(next.scope, next.statuses, change.ward ?? undefined, next.assignee, 1);
  }
  if (change.assignee !== undefined && next.scope === "all") {
    const before = next.assignee;
    const after = validAssignee(change.assignee);
    let statuses = next.statuses;
    if (after !== undefined && before === undefined && sameStatuses(statuses, defaultStatuses("all"))) {
      statuses = defaultStatuses("all", after);
    } else if (after === undefined && before !== undefined && sameStatuses(statuses, defaultStatuses("all", before))) {
      statuses = defaultStatuses("all");
    }
    next = build(next.scope, statuses, next.ward, after, 1);
  }
  if (change.statuses !== undefined) {
    next = build(next.scope, change.statuses, next.ward, next.assignee, 1);
  }
  return { ...next, page: 1 };
}

/** "Show closed leads" (A-8): checked with all three closed statuses ticked, unchecked with none, else mixed. */
export function closedToggle(state: ListState): ClosedToggle {
  const ticked = CLOSED_STATUSES.filter((status) => state.statuses.includes(status)).length;
  if (ticked === CLOSED_STATUSES.length) return "checked";
  return ticked === 0 ? "unchecked" : "mixed";
}

/**
 * A click on "Show closed leads" (C-45, A-8): checked → the three closed statuses are cleared (an empty set gives the
 * default); unchecked or mixed → all three are ticked. Page 1.
 */
export function toggleClosed(state: ListState): ListState {
  const closed = CLOSED_STATUSES as readonly LeadStatus[];
  const statuses =
    closedToggle(state) === "checked"
      ? state.statuses.filter((status) => !closed.includes(status))
      : [...state.statuses, ...closed];
  return withFilter(state, { statuses });
}

/** "Clear filters": the tab's default set, no ward, no assignee, page 1 (A-6). */
export function clearFilters(state: ListState): ListState {
  return { scope: state.scope, statuses: defaultStatuses(state.scope), page: 1 };
}
