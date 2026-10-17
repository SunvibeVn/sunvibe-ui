import { type CookieJar, clearLogoutPending, isLogoutPending, setLogoutPending } from "./browser-cookies";
import type { SessionApi } from "./session-api";
import type { SessionStore } from "./session-store";

// Logout and the pending logout (auth-browser-session §4.6, C-5). Only the API can clear the HttpOnly refresh cookie,
// so a user on a shared PC must be able to end the session even when that call fails: this tab signs out locally at
// once, and a non-secret "logout pending" flag makes the next page load (or sign-in) on this browser finish the job.
// Nothing here refreshes or reads a token.

export type LogoutDeps = {
  api: Pick<SessionApi, "logout">;
  store: Pick<SessionStore, "endLocally">;
  jar: CookieJar;
};

export type PendingLogoutDeps = Pick<LogoutDeps, "api" | "jar">;

/**
 * One logout request at a time per API client: a double click, or a page mounted twice in development, sends one
 * call and every caller gets its answer.
 */
const inflight = new WeakMap<Pick<SessionApi, "logout">, Promise<boolean>>();

/** True on 2xx. Any other status, a network error or timeout, and a rejected call all count as a failure. */
function requestLogout(api: Pick<SessionApi, "logout">): Promise<boolean> {
  const running = inflight.get(api);
  if (running) return running;
  const started: Promise<boolean> = (async () => {
    try {
      return (await api.logout()).ok;
    } catch {
      return false;
    }
  })().finally(() => {
    if (inflight.get(api) === started) inflight.delete(api);
  });
  inflight.set(api, started);
  return started;
}

/** The flag, read so that a cookie getter that throws (blocked site data) counts as "not pending". */
function logoutPending(jar: CookieJar): boolean {
  try {
    return isLogoutPending(jar);
  } catch {
    return false;
  }
}

/** Runs a local step; its failure must not keep the logout call from being sent. */
function bestEffort(step: () => void): void {
  try {
    step();
  } catch {
    // The flag or the local sign-out is best effort; the server call below still ends the session.
  }
}

/**
 * Signs out: sets the pending flag, ends the session in this tab (token, user, hint, broadcast to the other tabs),
 * then asks the API to end it. `"done"` clears the flag; on `"server-failed"` the flag stays so a retry or the next
 * page load sends the logout again. The caller clears the private view first and on `"done"` replaces the page
 * with `/`. Never throws.
 */
export async function signOut(deps: LogoutDeps): Promise<"done" | "server-failed"> {
  bestEffort(() => setLogoutPending(deps.jar));
  bestEffort(() => deps.store.endLocally("signed-out"));
  if (!(await requestLogout(deps.api))) return "server-failed";
  bestEffort(() => clearLogoutPending(deps.jar));
  return "done";
}

/**
 * On page load: when a logout is pending, sends it once in the background; a 2xx clears the flag (logout is
 * idempotent). Never refreshes and never throws.
 */
export async function retryPendingLogout(deps: PendingLogoutDeps): Promise<void> {
  if (!logoutPending(deps.jar)) return;
  if (await requestLogout(deps.api)) bestEffort(() => clearLogoutPending(deps.jar));
}

/**
 * Before a sign-in or registration (auth-browser-session S-23): a pending logout is tried once, then the flag is
 * cleared whatever the answer, so it cannot hide the new session. Never throws.
 */
export async function settlePendingLogoutBeforeSignIn(deps: PendingLogoutDeps): Promise<void> {
  if (!logoutPending(deps.jar)) return;
  await requestLogout(deps.api);
  bestEffort(() => clearLogoutPending(deps.jar));
}
