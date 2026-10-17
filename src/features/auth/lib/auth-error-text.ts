import type { PublicApiHttpError, PublicApiNetworkError } from "@/lib/api";

// The text an auth screen shows for a failed API call, chosen by the stable error `code` (never by the message;
// auth-browser-session §7). Anything the screen cannot explain, a network failure or a server error reads as
// "couldn't reach the server".

/** Which auth screen asks: some codes read differently on the sign-up code step. */
export type AuthErrorScreen = "login" | "sign-up-code" | "reset" | "generic";

export const AUTH_ERROR_TEXT = {
  generic: "We couldn't reach the server. Please try again.",
  invalidCredentials: "Phone number or password is incorrect.",
  locked: (wait: string) => `Too many failed attempts. Try again in ${wait}.`,
  tooManyRequests: (wait: string) => `Too many requests. Please wait ${wait} and try again.`,
  codeIncorrect: "Incorrect verification code.",
  codeExpired: "The verification code is invalid or has expired. Please request a new one.",
  codeAttemptsExceeded: "Too many incorrect codes. Please request a new one.",
  codeElsewhere: "The code is incorrect or has expired.",
  resetTokenInvalid: "This reset link is invalid or has expired. Request a new one.",
  accountDisabled: "Account is locked or disabled.",
  /** Sign-in, sign-up and password reset refuse to send when the browser keeps no cookie or `sessionStorage`. */
  cookiesRequired:
    "Sunvibe needs cookies to keep you signed in. Turn on cookies for sunvibe.vn in your browser settings, then reload this page.",
} as const;

const SIGN_UP_CODE_TEXT: Partial<Record<string, string>> = {
  CODE_INCORRECT: AUTH_ERROR_TEXT.codeIncorrect,
  CODE_EXPIRED: AUTH_ERROR_TEXT.codeExpired,
  CODE_ATTEMPTS_EXCEEDED: AUTH_ERROR_TEXT.codeAttemptsExceeded,
};

export function authErrorText(
  result: PublicApiHttpError | PublicApiNetworkError,
  screen: AuthErrorScreen,
): string {
  if (result.kind === "network" || result.status >= 500) return AUTH_ERROR_TEXT.generic;

  switch (result.code) {
    case "INVALID_CREDENTIALS":
      return screen === "login" ? AUTH_ERROR_TEXT.invalidCredentials : AUTH_ERROR_TEXT.generic;
    case "ACCOUNT_LOCKED":
      return AUTH_ERROR_TEXT.locked(formatWait(result.retryAfterSeconds));
    case "RATE_LIMITED":
    case "CODE_RESEND_TOO_SOON":
    case "CODE_DAILY_LIMIT":
      return AUTH_ERROR_TEXT.tooManyRequests(formatWait(result.retryAfterSeconds));
    case "CODE_INCORRECT":
    case "CODE_EXPIRED":
    case "CODE_ATTEMPTS_EXCEEDED":
      return (screen === "sign-up-code" && SIGN_UP_CODE_TEXT[result.code]) || AUTH_ERROR_TEXT.codeElsewhere;
    case "RESET_TOKEN_INVALID":
      return AUTH_ERROR_TEXT.resetTokenInvalid;
    case "ACCOUNT_DISABLED":
      return AUTH_ERROR_TEXT.accountDisabled;
    default:
      // MALFORMED_REQUEST, NOT_FOUND, ORIGIN_NOT_ALLOWED, a code the flow handles as a redirect, or no code at all.
      return AUTH_ERROR_TEXT.generic;
  }
}

/** The wait from `Retry-After`: "a few minutes" when missing, seconds under a minute, else whole minutes. */
export function formatWait(seconds?: number): string {
  if (!seconds) return "a few minutes";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
