"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** How a list reads and writes its URL. `parse` holds what the viewer may open. */
export type ListUrl<TState> = {
  parse(params: URLSearchParams): TState;
  serialize(state: TState): string;
};

/** What one list call came back with. */
export type ListOutcome<TPage, TError> = { kind: "page"; page: TPage } | { kind: "error"; error: TError };

/** A list call's answer, for one user and one normalized URL. */
type Loaded<TPage, TError> = { userId: string; key: string; outcome: ListOutcome<TPage, TError> };

export type ListStatus<TPage, TError> =
  | { kind: "loading" }
  | { kind: "ready"; page: TPage }
  | { kind: "error"; error: TError };

/** The list a URL describes: its state, the normalized query, and whether the URL already is that query. */
export function readListUrl<TState>(query: string, url: ListUrl<TState>) {
  const state = url.parse(new URLSearchParams(query));
  const canonical = url.serialize(state);
  return { state, canonical, normalized: query === canonical };
}

/**
 * The state after a change of tab or filter: its first page, read back through the URL, so a change never leads to a URL
 * the viewer may not open (W11-23).
 */
export function nextListState<TState extends { page: number }>(changed: TState, url: ListUrl<TState>): TState {
  return url.parse(new URLSearchParams(url.serialize({ ...changed, page: 1 })));
}

/**
 * Starts one list call; the function it returns gives up on the answer (a newer URL, the route hidden). An answer that
 * arrives after that, or after another user signed in, is dropped.
 */
export function startListRead<TPage, TError>(read: {
  userId: string;
  key: string;
  load(): Promise<ListOutcome<TPage, TError>>;
  currentUser(): string | null;
  onAnswer(loaded: Loaded<TPage, TError>): void;
}): () => void {
  let cancelled = false;
  void read.load().then((outcome) => {
    if (cancelled || read.currentUser() !== read.userId) return;
    read.onAnswer({ userId: read.userId, key: read.key, outcome });
  });
  return () => {
    cancelled = true;
  };
}

/**
 * What the list shows now: only an answer for this user and this URL, and the skeleton until the URL is normalized.
 * `page` is there as soon as the answer is, for the parts that sit outside the rows.
 */
export function listOnScreen<TPage, TError>(
  loaded: Loaded<TPage, TError> | null,
  now: { userId: string | null; canonical: string; normalized: boolean },
): { page: TPage | null; status: ListStatus<TPage, TError> } {
  const outcome = loaded !== null && loaded.userId === now.userId && loaded.key === now.canonical ? loaded.outcome : null;
  const page = outcome?.kind === "page" ? outcome.page : null;
  if (!now.normalized || outcome === null) return { page, status: { kind: "loading" } };
  return { page, status: outcome.kind === "page" ? { kind: "ready", page: outcome.page } : { kind: "error", error: outcome.error } };
}

type UrlListOptions<TState, TChange, TPage, TError> = ListUrl<TState> & {
  /** The list route. Next keeps a hidden route running, so the list acts only on its own URL. */
  path: string;
  /** The signed-in user: no call without one. */
  userId: string | null;
  /** `state` with a change of tab or filter applied. */
  withFilter(state: TState, change: TChange): TState;
  /** One list call. A new function reads again, so keep this and `parse` stable. */
  load(state: TState): Promise<ListOutcome<TPage, TError>>;
  /** True for a state with no list call of its own (a tab that reads something else). */
  skips?(state: TState): boolean;
  /** Forgets the rows when the route is hidden, so nothing old shows on Back while the new read runs. */
  forgetWhenHidden?: boolean;
};

/**
 * A staff list driven by its URL. Staff data is read in the browser only: the URL is normalized for the viewer first
 * (`router.replace`), then one call per user and URL. The call runs again when the route is shown after being hidden
 * (Activity). `useSearchParams` needs a Suspense boundary around the caller.
 */
export function useUrlList<TState extends { page: number }, TChange, TPage, TError>({
  path,
  userId,
  parse,
  serialize,
  withFilter,
  load,
  skips,
  forgetWhenHidden = false,
}: UrlListOptions<TState, TChange, TPage, TError>) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  // The only source of state for a call: the URL read for this viewer.
  const { state, canonical, normalized } = useMemo(() => readListUrl(query, { parse, serialize }), [query, parse, serialize]);

  const [loaded, setLoaded] = useState<Loaded<TPage, TError> | null>(null);
  const [reloads, setReloads] = useState(0);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useLayoutEffect(() => {
    if (!forgetWhenHidden) return;
    return () => setLoaded(null);
  }, [forgetWhenHidden]);

  // 1. A URL that is not the normalized one is replaced first; nothing is requested for it.
  useEffect(() => {
    if (userId === null || normalized || pathname !== path) return;
    router.replace(`${path}?${canonical}`, { scroll: false });
  }, [userId, normalized, pathname, path, canonical, router]);

  // 2. One call per user and normalized URL; an answer for another URL or another user is dropped.
  useEffect(() => {
    if (userId === null || !normalized || pathname !== path || skips?.(state)) return;
    return startListRead({
      userId,
      key: canonical,
      load: () => load(state),
      currentUser: () => userIdRef.current,
      onAnswer: setLoaded,
    });
  }, [userId, normalized, pathname, path, canonical, state, load, skips, reloads]);

  const retry = useCallback(() => {
    setLoaded(null);
    setReloads((count) => count + 1);
  }, []);

  const setFilter = (change: TChange): void => {
    const next = nextListState(withFilter(state, change), { parse, serialize });
    router.replace(`${path}?${serialize(next)}`, { scroll: false });
  };

  return { state, canonical, normalized, ...listOnScreen(loaded, { userId, canonical, normalized }), retry, setFilter };
}
