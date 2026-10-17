import { AUTH_ROUTES } from "../constants";
import type { SessionSnapshot } from "../session/session-store";
import { safeRedirectPath } from "./safe-redirect";

// The decisions behind the shared session pieces of staff pages (auth-browser-session §6). Components only render
// what these return.

/**
 * Texts of the screens and blocks of protected pages (auth-browser-session §6, §7): Vietnamese from the `Session`
 * messages by default; an English auth screen passes its own so no screen mixes languages.
 */
export type SessionTexts = {
  /** Shown while the session is restored, and while "Sign out on this device" runs and the page goes to `/`. */
  loading: string;
  /** Shown while the page leaves for the login page. */
  leaving: string;
  expiredTitle: string;
  expiredBody: string;
  expiredLink: string;
  unavailableTitle: string;
  unavailableBody: string;
  /** Shown after a 429; `{n}` becomes the seconds to wait. */
  rateLimited: string;
  retry: string;
  signOutHere: string;
  /** "Signed out here, but not on the server" (logout failed). Without it the page leaves for `/` anyway. */
  logoutFailed?: string;
  /** The button that sends the failed logout again; shown with `logoutFailed`. */
  tryAgain?: string;
};

export type SessionView = "loading" | "redirect-login" | "redirect-expired" | "unavailable" | "content";

/**
 * What a protected page shows for a session state: restoring → loading; a session that expired (refresh 401) → the
 * 401 screen while it leaves for the login page; any other signed-out state → straight to the login page;
 * unavailable → the retry block; signed in → the page.
 */
export function sessionView(snapshot: SessionSnapshot): SessionView {
  switch (snapshot.status) {
    case "restoring":
      return "loading";
    case "signed-out":
      return snapshot.endedBy === "expired" ? "redirect-expired" : "redirect-login";
    case "unavailable":
      return "unavailable";
    case "signed-in":
      return "content";
  }
}

/**
 * Whether a protected page renders its private children: only for a signed-in session and only while its route is
 * visible. Next hides recently visited routes with React `<Activity>` instead of unmounting them; a hidden route sees
 * no session change, so its private children are taken out while hidden and the session is read again before the
 * route is shown (auth-browser-session §4.5, §4.7).
 */
export function privateContentShown(view: SessionView, visible: boolean): boolean {
  return visible && view === "content";
}

const SUPER_ADMIN = "SUPER_ADMIN";
const ADMIN = "ADMIN";

/** True when the user holds one of `anyOf`; a super admin also holds the admin role (auth-roles BR-4). */
export function hasAnyRole(userRoles: readonly string[], anyOf: readonly string[]): boolean {
  const held = new Set(userRoles);
  if (held.has(SUPER_ADMIN)) held.add(ADMIN);
  return anyOf.some((role) => held.has(role));
}

/**
 * The login page that brings the user back to `path` (path and query of this site only; anything else becomes `/`).
 * `expired` adds the "session expired" notice.
 */
export function loginRedirectUrl(path: string, expired: boolean): string {
  const next = encodeURIComponent(safeRedirectPath(path, "/"));
  return expired ? `${AUTH_ROUTES.login}?session=expired&next=${next}` : `${AUTH_ROUTES.login}?next=${next}`;
}

/** The whole seconds to show in the "too many attempts" text after a 429, or null when the API gave no wait. */
export function rateLimitSeconds(snapshot: SessionSnapshot): number | null {
  const seconds = snapshot.retryAfterSeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil(seconds);
}

/**
 * After "Sign out on this device": leave for the home page, or show the "couldn't end your session on the server"
 * notice when the screen has a text for it. Without that text the page leaves anyway; the pending-logout flag stays
 * and the next page load sends the logout again (auth-browser-session §4.6).
 */
export function afterSignOut(result: "done" | "server-failed", hasFailedText: boolean): "leave" | "show-failed" {
  return result === "server-failed" && hasFailedText ? "show-failed" : "leave";
}

/** Puts the seconds into a "{n}" text (the 429 text of the unavailable block, in either language). */
export function fillSeconds(template: string, seconds: number): string {
  return template.replaceAll("{n}", String(seconds));
}

/**
 * Where "Sign out on this device" stands on a protected page: `signing-out` while the logout call runs, `failed`
 * when it failed and the screen shows that, `retrying` while it is sent again, `leaving` once the page goes to `/`.
 * Any state but `idle` takes the screen over: signing out ends the session in this tab at once, and the page must not
 * then send the user to the login page.
 */
export type SignOutExit = "idle" | "signing-out" | "failed" | "retrying" | "leaving";

export type SignOutEvent =
  | { type: "start" }
  | { type: "signed-out"; result: "done" | "server-failed"; hasFailedText: boolean }
  | { type: "try-again" }
  | { type: "retried"; stillPending: boolean };

/** The next sign-out state; an event that does not fit the current state (a double click) changes nothing. */
export function nextExit(exit: SignOutExit, event: SignOutEvent): SignOutExit {
  switch (event.type) {
    case "start":
      return exit === "idle" ? "signing-out" : exit;
    case "signed-out":
      if (exit !== "signing-out") return exit;
      return afterSignOut(event.result, event.hasFailedText) === "leave" ? "leaving" : "failed";
    case "try-again":
      return exit === "failed" ? "retrying" : exit;
    case "retried":
      if (exit !== "retrying") return exit;
      return event.stillPending ? "failed" : "leaving";
  }
}

/**
 * What a sign-out state shows instead of the page, or null when the session state decides. `busy` is a neutral
 * status (the loading text): the page goes to `/`, not to the login page.
 */
export function exitView(exit: SignOutExit): "busy" | "logout-failed" | null {
  if (exit === "idle") return null;
  return exit === "failed" || exit === "retrying" ? "logout-failed" : "busy";
}
