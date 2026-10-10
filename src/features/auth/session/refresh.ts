import { ApiError } from "@/lib/api";
import { refreshSession } from "../services/auth-api";
import type { AuthSession } from "../types/auth.types";

export type RefreshOutcome =
  | { kind: "none" }
  | { kind: "refreshed"; session: AuthSession }
  /** The backend rejected the refresh token: the session is over. */
  | { kind: "expired" }
  /** The backend couldn't be reached: keep the cookies and try on the next request. */
  | { kind: "unavailable" };

export async function refreshIfNeeded(
  tokens: { access?: string; refresh?: string },
  headers: Record<string, string>,
  refresh: typeof refreshSession = refreshSession,
): Promise<RefreshOutcome> {
  if (tokens.access || !tokens.refresh) return { kind: "none" };
  try {
    return { kind: "refreshed", session: await refresh(tokens.refresh, headers) };
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return { kind: "expired" };
    console.error("[auth] Token refresh failed:", error instanceof Error ? error.message : error);
    return { kind: "unavailable" };
  }
}
