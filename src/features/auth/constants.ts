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
export const PROTECTED_PATHS: readonly string[] = [AUTH_ROUTES.account, AUTH_ROUTES.verifyPhone, "/workspace"];

/** Pages for visitors only: the proxy sends signed-in users to their account. */
export const GUEST_ONLY_PATHS: readonly string[] = [AUTH_ROUTES.login, AUTH_ROUTES.signUp];

export const RESET_TOKEN_MAX_AGE_SECONDS = 15 * 60;

/**
 * auth-service `password-reset.resend-cooldown`. Inside it, asking again for an
 * SMS code returns a decoy reset token and sends nothing.
 */
export const SMS_RESEND_COOLDOWN_SECONDS = 60;
