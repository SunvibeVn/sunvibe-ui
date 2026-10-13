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
  SIGNUP_COOKIE,
  signUpCookieOptions,
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

/**
 * Where the visitor is in "verify first, register later": the phone the SMS code went
 * to, when another code may be requested and, once the code was confirmed, the
 * registration token (and its expiry) that the final register call must present.
 */
export type SignUpEntry = {
  phone: string;
  resendAvailableAt?: string;
  registrationToken?: string;
  tokenExpiresAt?: string;
};

export async function saveSignUpEntry(entry: SignUpEntry) {
  (await cookies()).set(SIGNUP_COOKIE, JSON.stringify(entry), signUpCookieOptions());
}

export async function readSignUpEntry(): Promise<SignUpEntry | undefined> {
  const raw = (await cookies()).get(SIGNUP_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const entry: unknown = JSON.parse(raw);
    if (entry && typeof entry === "object" && "phone" in entry && typeof entry.phone === "string" && entry.phone) {
      const text = (key: string) => {
        const value = (entry as Record<string, unknown>)[key];
        return typeof value === "string" && value ? value : undefined;
      };
      return {
        phone: entry.phone,
        resendAvailableAt: text("resendAvailableAt"),
        registrationToken: text("registrationToken"),
        tokenExpiresAt: text("tokenExpiresAt"),
      };
    }
  } catch {
    // Malformed or tampered cookie: treat as absent.
  }
  return undefined;
}

export async function clearSignUpEntry() {
  (await cookies()).set(SIGNUP_COOKIE, "", expiredCookieOptions(signUpCookieOptions()));
}
