import { serverEnv } from "@/config/env";
import { createHttpClient, unwrap, type ApiResponse } from "@/lib/api";
import { BACKEND_REFRESH_COOKIE } from "../constants";
import { readSetCookie } from "../session/backend-cookies";
import type { AuthSession, AuthTokenResponse } from "../types/auth.types";

// Shared by auth.service.ts (Server Actions, pages) and session/refresh.ts
// (proxy). No "server-only" import here because proxy code can't use it.
export const authApi = createHttpClient({ baseUrl: () => serverEnv.apiBaseUrl, timeoutMs: 10_000 });

/**
 * The proxy refreshes before every request of a user whose access token
 * expired, landing page included; a stalled backend must not hold those up.
 */
const REFRESH_TIMEOUT_MS = 3_000;

type TokenCall = () => Promise<{ data: ApiResponse<AuthTokenResponse>; headers: Headers }>;

/** Runs a call that starts a session and pairs the body's access token with the refresh cookie. */
export async function toAuthSession(call: TokenCall): Promise<AuthSession> {
  const { data, headers } = await call();
  const body = unwrap(data);
  const refreshToken = readSetCookie(headers.getSetCookie(), BACKEND_REFRESH_COOKIE);
  if (!refreshToken) {
    throw new Error("auth-service response has no refresh-token cookie");
  }
  return {
    accessToken: body.accessToken,
    refreshToken,
    expiresIn: body.expiresIn,
    phoneVerified: body.phoneVerified,
  };
}

/** Exchanges a refresh token for a new pair (the backend rotates it). */
export function refreshSession(refreshToken: string, headers: Record<string, string>) {
  return toAuthSession(() =>
    authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/auth/refresh-token", undefined, {
      cache: "no-store",
      headers,
      cookie: { [BACKEND_REFRESH_COOKIE]: refreshToken },
      timeoutMs: REFRESH_TIMEOUT_MS,
    }),
  );
}
