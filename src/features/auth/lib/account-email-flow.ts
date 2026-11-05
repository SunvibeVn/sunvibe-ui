import { AUTH_ROUTES, EMAIL_SEND_TIMEOUT_MS } from "../constants";
import { emailBindSendSchema, otpSchema } from "../schemas/auth.schema";
import type { CallApi } from "../session/api-client";
import { type BrowserEnvironment, cookiesAndStorageWork } from "../session/browser-cookies";
import { confirmEmailBindSession, type EmailBindStore, type SessionApi } from "../session/session-api";
import type { SessionStore, SignInRef } from "../session/session-store";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { type FormState, formStateFromResult, validationError } from "./form-state";

// Bind or replace the account email (`/account/email`, auth-email-access spec 4.9, 6.2): the new address and the current
// password, then the code from that mailbox. The step lives in the form's memory only, so a reload starts over and no
// proof is stored. Every check runs here, not only on the buttons: React replays a submit made before hydration through
// the form action. Nothing here logs, and a state never holds the password.

export type AccountEmailDeps = {
  callApi: CallApi;
  api: Pick<SessionApi, "confirmEmailBind">;
  store: EmailBindStore & Pick<SessionStore, "generation" | "getSnapshot">;
  /** The page's `window` (or a window-like object), read at submit time. */
  env: BrowserEnvironment;
};

/** The code step: what the code was sent for, and the sign-in that asked for it. */
export type BindStep = {
  newEmail: string;
  sentTo: string;
  resendAvailableAt?: string;
  start: SignInRef;
};

export type BindSendState = FormState & { step?: BindStep };
/** `restart`: this code can do nothing more, so the form goes back to the address. */
export type BindConfirmState = FormState & { restart?: boolean };
export type Redirect = { redirect: string };

const SESSION_CHANGED = "Your session changed. Please start again.";
const ALREADY_YOURS = "This is already your email.";

/** The sign-in of this tab, or null when there is none. */
function currentSignIn(store: AccountEmailDeps["store"]): SignInRef | null {
  const generation = store.generation();
  const userId = store.getSnapshot().user?.userId;
  return generation && userId ? { generation, userId } : null;
}

/** Checks the password on the server and mails a code to the new address. */
export async function sendBindCode(
  values: { newEmail: string; currentPassword: string },
  deps: AccountEmailDeps,
): Promise<BindSendState> {
  const kept = { newEmail: values.newEmail };
  // auth-browser-session §4.10: the session this step ends in could not be kept.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = emailBindSendSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, kept);
  const { newEmail, currentPassword } = parsed.data;

  const start = currentSignIn(deps.store);
  if (!start) return { status: "idle", values: kept };

  // `callApi` sends this again after a refresh, so the request is built on every run.
  const result = await deps.callApi(
    (client) => client.POST("/api/v1/me/email/send-code", { body: { newEmail, currentPassword } }),
    { timeoutMs: EMAIL_SEND_TIMEOUT_MS },
  );
  // The session decides what the page shows then.
  if (!result.ok && (result.kind === "signed-out" || result.kind === "unavailable")) return { status: "idle", values: kept };
  // The mailbox may hold a code by now, but it was asked for under another sign-in: this form cannot use it.
  if (!deps.store.isSignIn(start)) return { status: "error", message: SESSION_CHANGED };

  if (result.ok) {
    const { sentTo, resendAvailableAt } = result.data;
    return { status: "success", step: { newEmail, sentTo: sentTo ?? newEmail, resendAvailableAt, start } };
  }
  if (result.kind === "http" && result.code === "ALREADY_VERIFIED") {
    return { status: "error", fieldErrors: { newEmail: [ALREADY_YOURS] }, values: kept };
  }
  return formStateFromResult(result, { values: kept, screen: "generic" });
}

/** A new code costs the password again: an open session alone binds nothing (spec 6.2). */
export function resendBindCode(step: BindStep): FormState {
  return { status: "idle", values: { newEmail: step.newEmail } };
}

/** Confirms the code. On success this device has a new session: every other one ended (D4-12). */
export async function confirmBindCode(
  values: { code: string },
  step: BindStep,
  deps: AccountEmailDeps,
): Promise<BindConfirmState | Redirect> {
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired };

  const parsed = otpSchema.safeParse({ code: values.code });
  if (!parsed.success) return validationError(parsed.error);

  const result = await confirmEmailBindSession(
    deps,
    { newEmail: step.newEmail, code: parsed.data.code },
    step.start,
  );
  if (result.ok) return { redirect: `${AUTH_ROUTES.account}?email=bound` };

  if (result.kind === "signed-out" || result.kind === "unavailable") return { status: "idle" };
  if (result.kind === "stale") return { status: "error", message: SESSION_CHANGED, restart: true };
  if (result.kind === "http" && result.code === "EMAIL_NOT_AVAILABLE") {
    return { status: "error", message: AUTH_ERROR_TEXT.emailNotAvailable, restart: true };
  }
  return formStateFromResult(result, { screen: "sign-up-code" });
}
