import {
  ACCESS_TOKEN_EXPIRY_SKEW_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  RESET_TOKEN_MAX_AGE_SECONDS,
  SIGNUP_MAX_AGE_SECONDS,
} from "../constants";

export type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * `__Host-` makes browsers require Secure and Path=/ and refuse a Domain
 * attribute, so no subdomain can plant or overwrite the session cookies.
 * Plain HTTP on localhost can't use it, hence production only.
 */
export function sessionCookieNames(production = isProduction()) {
  const prefix = production ? "__Host-" : "";
  return { access: `${prefix}sv_at`, refresh: `${prefix}sv_rt` };
}

/** Holds the SMS reset token between /forgot-password and /reset-password. */
export const RESET_TOKEN_COOKIE = "sv_reset";

/**
 * Holds the sign-up progress (phone, resend time and, once the SMS code is
 * confirmed, the registration token) between /sign-up, /sign-up/verify and
 * /sign-up/details.
 */
export const SIGNUP_COOKIE = "sv_signup";

export function accessCookieOptions(expiresInSeconds: number, production = isProduction()) {
  return options(production, "/", Math.max(0, expiresInSeconds - ACCESS_TOKEN_EXPIRY_SKEW_SECONDS));
}

export function refreshCookieOptions(production = isProduction()) {
  return options(production, "/", REFRESH_TOKEN_MAX_AGE_SECONDS);
}

/**
 * Path=/ because both /forgot-password (to avoid overwriting the real token
 * with a cooldown decoy) and /reset-password read it.
 */
export function resetCookieOptions(production = isProduction()) {
  return options(production, "/", RESET_TOKEN_MAX_AGE_SECONDS);
}

/** Path=/ like the reset cookie: the three sign-up pages share it. */
export function signUpCookieOptions(production = isProduction()) {
  return options(production, "/", SIGNUP_MAX_AGE_SECONDS);
}

/** Deleting a cookie needs the same path and Secure flag it was set with. */
export function expiredCookieOptions(cookie: CookieOptions): CookieOptions {
  return { ...cookie, maxAge: 0 };
}

function options(secure: boolean, path: string, maxAge: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path, maxAge };
}
