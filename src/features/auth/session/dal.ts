import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "./cookies";

/** What pages may know about the signed-in user. */
export type SessionUser = {
  fullName: string;
  phoneNumber: string;
  email: string | null;
  accountStatus: string;
  phoneVerified: boolean;
  emailVerified: boolean;
};

/** Whether session cookies exist. No backend call: for UI hints only, never for authorization. */
export async function hasSession(): Promise<boolean> {
  const { accessToken, refreshToken } = await readSessionTokens();
  return Boolean(accessToken || refreshToken);
}

/** The signed-in user, or null. At most one backend call per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { accessToken } = await readSessionTokens();
  if (!accessToken) return null;
  try {
    const profile = await authService.getProfile(accessToken);
    return {
      fullName: profile.fullName,
      phoneNumber: profile.username,
      email: profile.email,
      accountStatus: profile.accountStatus,
      phoneVerified: profile.phoneVerified,
      emailVerified: profile.emailVerified,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isNotFound)) return null;
    throw error;
  }
});

/** Login URL for a session the backend no longer accepts. The proxy lets it through even with stale cookies. */
export function expiredSessionUrl(returnTo: string) {
  return `${AUTH_ROUTES.login}?session=expired&next=${encodeURIComponent(returnTo)}`;
}

/** The signed-in user; otherwise redirects to the login page and comes back to `returnTo`. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(expiredSessionUrl(returnTo));
  return user;
}
