import { AUTH_ROUTES } from "../constants";
import { loginSchema } from "../schemas/auth.schema";
import { type BrowserEnvironment, type CookieJar, cookiesAndStorageWork } from "../session/browser-cookies";
import type { PendingLogoutDeps } from "../session/logout";
import type { LoginRequest, SessionApi } from "../session/session-api";
import type { SessionStore, SessionUser } from "../session/session-store";
import { AUTH_ERROR_TEXT, type AuthErrorScreen } from "./auth-error-text";
import { type FormState, formStateFromResult, validationError } from "./form-state";
import { safeRedirectPath } from "./safe-redirect";

export type LoginDeps = {
  api: Pick<SessionApi, "login" | "logout">;
  store: Pick<SessionStore, "adopt" | "getSnapshot">;
  jar: CookieJar;
  /** The page's `window` (or a window-like object), read at submit time. */
  env: BrowserEnvironment;
  settlePending: (deps: PendingLogoutDeps) => Promise<void>;
};

export type LoginValues = { email: string; password: string; next?: string };

export type LoginOutcome = FormState | { redirect: string };

/**
 * Where a session goes first: what the server asks of the account wins over `next` (auth-email-access spec 4.6, 6.2).
 * Never decided from `phoneVerified`: an email account has no verified phone and owes none.
 */
export function pathAfterSignIn(user: Pick<SessionUser, "requiredAction">, next?: string): string {
  if (user.requiredAction === "BIND_EMAIL") return AUTH_ROUTES.accountEmail;
  if (user.requiredAction === "VERIFY_PHONE") return AUTH_ROUTES.verifyPhone;
  return safeRedirectPath(next, AUTH_ROUTES.account);
}

/** What a sign-in does once its values are valid, by email or by phone. `kept` refills the form and holds no password. */
export async function sendSignIn(
  request: LoginRequest,
  { kept, next, screen }: { kept: Record<string, string>; next?: string; screen: AuthErrorScreen },
  deps: LoginDeps,
): Promise<LoginOutcome> {
  // A logout still pending on this browser is sent (and its flag cleared) before the new sign-in replaces the cookie;
  // only by a submit that will send the login, so a refused submit keeps the flag for the next retry.
  await deps.settlePending({ api: deps.api, jar: deps.jar });
  let result: Awaited<ReturnType<LoginDeps["api"]["login"]>>;
  try {
    result = await deps.api.login(request);
  } catch {
    // For example a missing API URL or a refused Web Lock: nothing was sent, so the form shows the generic text.
    return { status: "error", message: AUTH_ERROR_TEXT.generic, values: kept };
  }
  if (!result.ok) return formStateFromResult(result, { values: kept, screen });

  // Adopted in the same continuation as the answer: an await here would let another tab's refresh run in between
  // and see a different account behind the cookie than this tab knows.
  deps.store.adopt(result.data, { newSignIn: true });
  const { status, user } = deps.store.getSnapshot();
  if (status !== "signed-in" || !user) return { status: "error", message: AUTH_ERROR_TEXT.generic, values: kept };

  return { redirect: pathAfterSignIn(user, next) };
}

/**
 * Signs in from the browser (auth-browser-session §5 `/login`). Every check runs here, not only on the button: React
 * replays a submit made before hydration through this action (auth-browser-session §4.9).
 * Returns where to go on success, else the form state to show. Never logs, and the state never holds the password.
 */
export async function submitLogin(values: LoginValues, deps: LoginDeps): Promise<LoginOutcome> {
  // auth-browser-session §4.10: without a working cookie and sessionStorage the session cannot be kept, so send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired };

  const kept = { email: values.email };
  const parsed = loginSchema.safeParse({ email: values.email, password: values.password });
  if (!parsed.success) return validationError(parsed.error, kept);

  return sendSignIn(parsed.data, { kept, next: values.next, screen: "login" }, deps);
}
