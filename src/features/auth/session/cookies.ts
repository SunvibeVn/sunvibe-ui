import "server-only";

import { cookies } from "next/headers";
import type { AuthSession } from "../types/auth.types";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  RESET_TOKEN_COOKIE,
  resetCookieOptions,
  sessionCookieNames,
} from "./cookie-config";

// Writes only work in Server Actions and Route Handlers; reads work anywhere
// on the server but must sit behind <Suspense> (cacheComponents).

export async function saveSession(session: Pick<AuthSession, "accessToken" | "refreshToken" | "expiresIn">) {
  const store = await cookies();
  const names = sessionCookieNames();
  store.set(names.access, session.accessToken, accessCookieOptions(session.expiresIn));
  store.set(names.refresh, session.refreshToken, refreshCookieOptions());
}

export async function clearSession() {
  const store = await cookies();
  const names = sessionCookieNames();
  store.set(names.access, "", expiredCookieOptions(accessCookieOptions(0)));
  store.set(names.refresh, "", expiredCookieOptions(refreshCookieOptions()));
}

export async function readSessionTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  const names = sessionCookieNames();
  return {
    accessToken: store.get(names.access)?.value || undefined,
    refreshToken: store.get(names.refresh)?.value || undefined,
  };
}

export async function saveResetToken(token: string) {
  (await cookies()).set(RESET_TOKEN_COOKIE, token, resetCookieOptions());
}

export async function readResetToken(): Promise<string | undefined> {
  return (await cookies()).get(RESET_TOKEN_COOKIE)?.value || undefined;
}

export async function clearResetToken() {
  (await cookies()).set(RESET_TOKEN_COOKIE, "", expiredCookieOptions(resetCookieOptions()));
}
