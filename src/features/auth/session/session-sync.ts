import { AUTH_ROUTES } from "../constants";
import { type CookieJar, isLogoutPending, readHint } from "./browser-cookies";
import { isProtectedPath } from "./route-guard";
import type { SessionStore } from "./session-store";

// Keeps this tab in step with the sign-in of the browser (auth-browser-session §4.5, §4.7, §4.8): after a sign-out or
// a new sign-in in another tab, and when a page comes back from the back-forward cache, this tab drops its token and
// private data and updates its header. Channel messages are only a trigger; the decision is taken from the cookies,
// never from a message.

type Listener = (event: Event) => void;

/** `BroadcastChannel`, `Window` and `Document` fit. */
type Listenable = {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
};

/** Why private views are reset: nobody is signed in any more, or another sign-in replaced this tab's one. */
export type ResetReason = "signed-out" | "other-sign-in";

export type SyncTimers = {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type SessionSyncDeps = {
  store: Pick<SessionStore, "getSnapshot" | "generation" | "resetLocal">;
  jar: CookieJar;
  /** The tab's `sv-auth` channel, or null where the browser has none (focus, visibility and pageshow still work). */
  channel: Listenable | null;
  win: Listenable;
  doc: Listenable & { readonly visibilityState: DocumentVisibilityState };
  /** Takes private views off the screen: a protected page leaves or reloads, a public one re-renders its header. */
  resetPrivateViews(reason: ResetReason): void;
  /** Defaults to `setTimeout` / `clearTimeout`. */
  timers?: SyncTimers;
};

/**
 * A message can arrive before this renderer sees the cookie change that came with it, so a message is checked once
 * more after this delay.
 */
const MESSAGE_RECHECK_MS = 250;

const defaultTimers: SyncTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
};

const restoredFromCache = (event: Event): boolean => "persisted" in event && event.persisted === true;

/** Starts listening; the returned function removes every listener it added and any pending re-check. */
export function startSessionSync(deps: SessionSyncDeps): () => void {
  const { store, jar } = deps;
  const timers = deps.timers ?? defaultTimers;
  let recheck: { handle: unknown } | null = null;

  /** Only this tab's memory: the tab that signed out or in already wrote the cookies and told everyone. */
  function reset(reason: ResetReason): void {
    store.resetLocal();
    deps.resetPrivateViews(reason);
  }

  function reconcile(): void {
    const hint = readHint(jar);
    const status = store.getSnapshot().status;
    // A pending logout counts as signed out: the hint may still be there while another tab finishes it.
    if (hint === null || isLogoutPending(jar)) {
      if (status !== "signed-out") reset("signed-out");
      return;
    }
    const bound = store.generation();
    if (bound === null) {
      // A signed-out tab learns of a sign-in in another tab: its header updates (auth-browser-session §4.8). A tab
      // still restoring takes whichever sign-in the hint names when its restore runs.
      if (status === "signed-out") reset("other-sign-in");
      return;
    }
    if (bound !== hint) reset("other-sign-in");
  }

  function cancelRecheck(): void {
    if (recheck) timers.clear(recheck.handle);
    recheck = null;
  }

  const onMessage: Listener = () => {
    reconcile();
    // One pending re-check at a time: a burst of messages keeps only the latest.
    cancelRecheck();
    recheck = {
      handle: timers.set(() => {
        recheck = null;
        reconcile();
      }, MESSAGE_RECHECK_MS),
    };
  };
  const onFocus: Listener = () => reconcile();
  const onVisibility: Listener = () => {
    if (deps.doc.visibilityState === "visible") reconcile();
  };
  // Synchronous, so the reset happens before the restored page is used (auth-browser-session §4.7).
  const onPageShow: Listener = (event) => {
    if (restoredFromCache(event)) reconcile();
  };

  // The store reads the cookies on first use. A public page (header rendered on the server) may never have read it,
  // so read it now: the state the page was opened with is pinned, and a later cookie change shows up as a change.
  store.getSnapshot();

  deps.channel?.addEventListener("message", onMessage);
  deps.win.addEventListener("focus", onFocus);
  deps.win.addEventListener("pageshow", onPageShow);
  deps.doc.addEventListener("visibilitychange", onVisibility);

  return () => {
    deps.channel?.removeEventListener("message", onMessage);
    deps.win.removeEventListener("focus", onFocus);
    deps.win.removeEventListener("pageshow", onPageShow);
    deps.doc.removeEventListener("visibilitychange", onVisibility);
    cancelRecheck();
  };
}

export type ResetPrivateViewsDeps = {
  location: Pick<Location, "pathname" | "replace" | "reload">;
  /** `router.refresh()`: re-renders the server components (the header) of a public page. */
  refresh(): void;
  /** True while this tab still holds a private view, also one hidden by `<Activity>` (see `private-views.ts`). */
  privateViewMounted(): boolean;
};

/**
 * auth-browser-session §4.5: after a sign-out a protected page leaves for the login page with a replace navigation;
 * after another sign-in it reloads. Both are full loads that drop the page's memory. A public page only refreshes
 * its header, unless the tab still holds a private page hidden after a client-side navigation: then it reloads too,
 * so that page's data leaves the document and memory (§4.7, shared-PC anti-goal).
 */
export function createResetPrivateViews(deps: ResetPrivateViewsDeps): (reason: ResetReason) => void {
  return (reason) => {
    if (!isProtectedPath(deps.location.pathname)) {
      if (deps.privateViewMounted()) deps.location.reload();
      else deps.refresh();
    } else if (reason === "signed-out") deps.location.replace(AUTH_ROUTES.login);
    else deps.location.reload();
  };
}
