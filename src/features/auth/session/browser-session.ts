import { retryPendingLogout } from "./logout";
import type { SessionApi } from "./session-api";
import { type SessionSyncDeps, startSessionSync } from "./session-sync";

export type BrowserSessionDeps = SessionSyncDeps & { api: Pick<SessionApi, "logout"> };

/**
 * What a page does with the session when it mounts in the browser. A pending logout is sent first, in the
 * background and without any refresh (auth-browser-session §4.6 step 5). A second start while it runs (a double
 * mount in development) shares the same request. Then this tab follows the sign-ins and sign-outs of the other tabs
 * (§4.5). Returns the sync's cleanup.
 */
export function startBrowserSession(deps: BrowserSessionDeps): () => void {
  const { api, ...sync } = deps;
  void retryPendingLogout({ api, jar: deps.jar });
  return startSessionSync(sync);
}
