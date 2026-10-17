import type { components } from "@/api/generated/schema";
import type { CallApi } from "../session/api-client";
import type { SessionStore } from "../session/session-store";

// The signed-in user's profile, read only in the browser with the tab's token (auth-browser-session §4.7: private
// data never reaches server HTML or a cache). Nothing here logs.

export type MeResponse = components["schemas"]["MeResponse"];

export type AccountDeps = {
  callApi: CallApi;
  store: Pick<SessionStore, "markUnavailable" | "generation">;
};

/**
 * - `ready`: the profile.
 * - `session`: the session decides what the page shows (signed out, unavailable); the caller renders nothing more.
 *   A call answer alone never redirects: it may belong to a sign-in this tab has already replaced.
 * - `error`: the profile could not be loaded now; the page offers a retry.
 */
export type MeLoad = { kind: "ready"; me: MeResponse } | { kind: "session" } | { kind: "error" };

/** `GET /api/v1/me` through `callApi`: the profile of `/account` and the start of `/verify-phone`. */
export async function readMe(deps: AccountDeps): Promise<MeLoad> {
  const generation = deps.store.generation();
  const result = await deps.callApi((client) => client.GET("/api/v1/me"));
  if (result.ok) return { kind: "ready", me: result.data };
  if (result.kind === "signed-out" || result.kind === "unavailable") return { kind: "session" };
  if (result.kind === "http" && result.status === 404) {
    // auth-browser-session S-17: the account no longer exists. That is not a session end: the session is kept and
    // shown as unavailable, with a retry and "Sign out on this device". Only for the sign-in the call was sent under:
    // a late 404 of an older sign-in leaves the session that replaced it alone.
    if (deps.store.generation() === generation) deps.store.markUnavailable();
    return { kind: "session" };
  }
  return { kind: "error" };
}

const STATUS_LABELS: Partial<Record<string, string>> = {
  PENDING: "Pending phone verification",
  ACTIVE: "Active",
};

export function accountStatusLabel(status: string | undefined): string {
  if (!status) return "";
  return STATUS_LABELS[status] ?? status.toLowerCase();
}
