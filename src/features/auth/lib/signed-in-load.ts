import type { SessionStatus } from "../session/session-store";

// What a signed-in page (/account, /verify-phone) shows for the result of its first load. The data is read only in
// the browser with the tab's token (auth-browser-session §4.7). A call answer alone never redirects: it may belong to
// a sign-in this tab has already replaced.

/** A page load's result: its data, "the session decides" or a failure the page can retry. */
export type SignedInLoad = { kind: "ready" } | { kind: "session" } | { kind: "error" };

/** `none`: `RequireSession` shows the session's own state (signed out, unavailable), so the page adds nothing. */
export type SignedInLoadView<L extends SignedInLoad> =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none" }
  | Extract<L, { kind: "ready" }>;

const LOADING = Object.freeze({ kind: "loading" } as const);
const ERROR = Object.freeze({ kind: "error" } as const);
const NONE = Object.freeze({ kind: "none" } as const);

/**
 * A `session` result while the store is still signed in (for example `callApi` answered unavailable without touching
 * the store) shows the retry: rendering nothing would leave a blank page with no way on.
 */
export function signedInLoadView<L extends SignedInLoad>(load: L | null, status: SessionStatus): SignedInLoadView<L> {
  if (load === null) return LOADING;
  if (load.kind === "ready") return load as Extract<L, { kind: "ready" }>;
  if (load.kind === "error") return ERROR;
  return status === "signed-in" ? ERROR : NONE;
}

/** A load that leaves the page instead (for example `/verify-phone` of a verified account goes to `/account`). */
export type SignedInRedirect = { redirect: string };

/**
 * Hands a load answer to the page, only while that page is still shown: an answer that arrives after the content
 * unmounted (navigation away, or re-keyed for another user) neither renders nor redirects. A redirect keeps the
 * loading view.
 */
export function applySignedInLoad<L extends SignedInLoad>(
  result: L | SignedInRedirect,
  deps: { isActive(): boolean; setLoad(load: L): void; redirect(to: string): void },
): void {
  if (!deps.isActive()) return;
  if ("redirect" in result) deps.redirect(result.redirect);
  else deps.setLoad(result);
}
