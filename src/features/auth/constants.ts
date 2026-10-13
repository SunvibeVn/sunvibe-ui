export const AUTH_ROUTES = {
  login: "/login",
  signUp: "/sign-up",
  signUpVerify: "/sign-up/verify",
  signUpDetails: "/sign-up/details",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyPhone: "/verify-phone",
  account: "/account",
} as const;

/** Pages that need a session: the proxy sends visitors without one to the login page. */
export const PROTECTED_PATHS: readonly string[] = [AUTH_ROUTES.account, AUTH_ROUTES.verifyPhone];

/** Pages for visitors only: the proxy sends signed-in users to their account. */
export const GUEST_ONLY_PATHS: readonly string[] = [AUTH_ROUTES.login, AUTH_ROUTES.signUp];

/** Refresh-token cookie set by auth-service (`app.jwt.jwtRefreshCookieName`). */
export const BACKEND_REFRESH_COOKIE = "cookie-jwt-rf";

/** auth-service refresh-token idle lifetime (`app.jwt.jwtRefreshExpirationMs`). */
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** The access cookie expires this long before the token, so the proxy refreshes in time. */
export const ACCESS_TOKEN_EXPIRY_SKEW_SECONDS = 30;

export const RESET_TOKEN_MAX_AGE_SECONDS = 15 * 60;

/**
 * How long the sign-up progress cookie lives: the SMS code lasts 10 minutes and the
 * registration token 15 more after the code is confirmed (auth-service `VerificationPolicy`).
 */
export const SIGNUP_MAX_AGE_SECONDS = 30 * 60;

/**
 * auth-service `password-reset.resend-cooldown`. Inside it, asking again for an
 * SMS code returns a decoy reset token and sends nothing.
 */
export const SMS_RESEND_COOLDOWN_SECONDS = 60;
