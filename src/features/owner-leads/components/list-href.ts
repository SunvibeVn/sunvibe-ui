import {
  LIST_PATH,
  type ListFilterChange,
  type ListState,
  parseListState,
  serializeListState,
  withFilter,
} from "../lib/list-url-state";
import type { Viewer } from "../lib/viewer";

export { LIST_PATH };

/** Detail route of a lead; the id is URL-encoded. */
export function leadDetailHref(leadId: string): string {
  return `${LIST_PATH}/${encodeURIComponent(leadId)}`;
}

/**
 * URL of the list for `state` with `change` applied (page 1, or `page` when given). `withFilter` and
 * `serializeListState` do not know the viewer, so the result is parsed again with `viewer`: a scope the viewer may not
 * open becomes the default tab and its ward and assignee are dropped. Every tab link, filter change and page link
 * goes through here, so a SALE can never be sent to a URL with a scope other than "mine" (W11-23).
 */
export function listHref(state: ListState, change: ListFilterChange, viewer: Viewer, page = 1): string {
  const next = { ...withFilter(state, change), page };
  const safe = parseListState(new URLSearchParams(serializeListState(next)), viewer);
  return `${LIST_PATH}?${serializeListState(safe)}`;
}

/**
 * "All Leads" filtered by one assignee, with the assignee default (C-27, C-34, A-6): the former holder of the territories notice, the assignee link of the
 * detail header. Goes through `listHref`, so an id that is not a plain user id never reaches the URL and a viewer
 * without the all tab gets the default tab.
 */
export function assigneeListHref(assigneeId: string, viewer: Viewer): string {
  return listHref(parseListState(new URLSearchParams(), viewer), { scope: "all", assignee: assigneeId }, viewer);
}
