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

/** The SMS reset token, the phone it was requested for and when (epoch ms). */
export type ResetEntry = { token: string; phone?: string; issuedAt: number };

export async function saveResetToken(token: string, phone?: string) {
  const entry: ResetEntry = { token, phone, issuedAt: Date.now() };
  (await cookies()).set(RESET_TOKEN_COOKIE, JSON.stringify(entry), resetCookieOptions());
}

export async function readResetEntry(): Promise<ResetEntry | undefined> {
  const raw = (await cookies()).get(RESET_TOKEN_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const entry: unknown = JSON.parse(raw);
    if (entry && typeof entry === "object" && "token" in entry && typeof entry.token === "string" && entry.token) {
      return entry as ResetEntry;
    }
  } catch {
    // Malformed or tampered cookie: treat as absent.
  }
  return undefined;
}

export async function readResetToken(): Promise<string | undefined> {
  return (await readResetEntry())?.token;
}

export async function clearResetToken() {
  (await cookies()).set(RESET_TOKEN_COOKIE, "", expiredCookieOptions(resetCookieOptions()));
}
