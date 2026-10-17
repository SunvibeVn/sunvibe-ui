import type { components } from "@/api/generated/schema";
import {
  createPublicClient,
  type PublicApiHttpError,
  type PublicApiNetworkError,
  type PublicApiResult,
  type PublicClientOptions,
} from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { otpSchema, signUpDetailsSchema, signUpPhoneSchema } from "../schemas/auth.schema";
import { type BrowserEnvironment, type CookieJar, cookiesAndStorageWork } from "../session/browser-cookies";
import type { PendingLogoutDeps } from "../session/logout";
import type { SessionApi } from "../session/session-api";
import type { SessionStore } from "../session/session-store";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { type FieldErrors, type FormState, formStateFromResult, validationError } from "./form-state";
import { createPublicAuthClient } from "./public-auth-client";
import { sessionStorageOf } from "./session-storage";
import { clearSignUpProgress, isFuture, readSignUpStep, writeSignUpProgress } from "./signup-progress";

// "Verify first, register later" from the browser (auth-browser-session §5 sign-up): /sign-up (phone) →
// /sign-up/verify (SMS code) → /sign-up/details (name and password) → signed in. The progress lives in the tab's
// sessionStorage (auth-browser-session C-7). Every check runs inside these functions, not only on the buttons: React
// replays a submit made before hydration through the form action (auth-browser-session §4.9). Nothing here logs.

export type CodeSentResponse = components["schemas"]["CodeSentResponse"];
export type RegistrationTokenResponse = components["schemas"]["RegistrationTokenResponse"];

/** The two anonymous registration calls (no cookie, no Authorization, no Web Lock). */
export type RegistrationApi = {
  sendCode(phoneNumber: string): Promise<PublicApiResult<CodeSentResponse>>;
  verifyCode(phoneNumber: string, code: string): Promise<PublicApiResult<RegistrationTokenResponse>>;
};

/** The registration calls through an anonymous client built at the first call (`options` and `build` for tests). */
export function createRegistrationApi(
  options: PublicClientOptions = {},
  build: () => ReturnType<typeof createPublicClient> = () => createPublicClient(options),
): RegistrationApi {
  const send = createPublicAuthClient(build);
  return {
    sendCode: (phoneNumber) =>
      send((client) => client.POST("/api/v1/auth/registration/phone/send-code", { body: { phoneNumber } })),
    verifyCode: (phoneNumber, code) =>
      send((client) => client.POST("/api/v1/auth/registration/phone/verify-code", { body: { phoneNumber, code } })),
  };
}

export const registrationApi: RegistrationApi = createRegistrationApi();

export type SignUpDeps = {
  registration: RegistrationApi;
  api: Pick<SessionApi, "register" | "logout">;
  store: Pick<SessionStore, "adopt" | "getSnapshot">;
  jar: CookieJar;
  /** The page's `window` (or a window-like object), read at submit time. */
  env: BrowserEnvironment;
  settlePending: (deps: PendingLogoutDeps) => Promise<void>;
};

export type Redirect = { redirect: string };
export type SignUpOutcome = FormState | Redirect;
export type ResendState = FormState & { resendAvailableAt?: string };

const EXPIRED = `${AUTH_ROUTES.signUp}?expired=1`;
const PHONE_FIELDS = ["username", "phoneNumber"] as const;

/** The first message the server gave on the phone number (`username` when it is taken, `phoneNumber` otherwise). */
function phoneError(state: FormState): string | undefined {
  for (const field of PHONE_FIELDS) {
    const message = state.fieldErrors?.[field]?.[0];
    if (message) return message;
  }
  return undefined;
}

/** Step 1 shows every phone field error under its only input, `username`. */
function phoneErrorsOnUsername(state: FormState): FormState {
  const phoneNumber = state.fieldErrors?.phoneNumber;
  if (!state.fieldErrors || !phoneNumber) return state;
  const fieldErrors: FieldErrors = { ...state.fieldErrors, username: [...(state.fieldErrors.username ?? []), ...phoneNumber] };
  delete fieldErrors.phoneNumber;
  return { ...state, fieldErrors };
}

const storageOf = (deps: SignUpDeps) => sessionStorageOf(deps.env);

/** Step 1: texts a code to the phone number and moves to the code step. */
export async function startSignUp(values: { username: string }, deps: SignUpDeps): Promise<SignUpOutcome> {
  const kept = { username: values.username };
  // auth-browser-session §4.10: without a working cookie and sessionStorage the sign-up cannot finish, so send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = signUpPhoneSchema.safeParse(kept);
  if (!parsed.success) return validationError(parsed.error, kept);
  const phone = parsed.data.username;

  // Coming back with the same number must not cost another SMS: carry on where the visitor left off.
  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "details" && step.progress.phone === phone) return { redirect: AUTH_ROUTES.signUpDetails };
  if (step.kind === "code" && step.progress.phone === phone && isFuture(step.progress.resendAvailableAt)) {
    return { redirect: AUTH_ROUTES.signUpVerify };
  }

  const result = await deps.registration.sendCode(phone);
  // A taken number comes back as a field error, shown under the phone input.
  if (!result.ok) return phoneErrorsOnUsername(formStateFromResult(result, { values: kept, screen: "generic" }));

  writeSignUpProgress(storage, { phone, resendAvailableAt: result.data.resendAvailableAt }, { restart: true });
  return { redirect: AUTH_ROUTES.signUpVerify };
}

function resendFailure(result: PublicApiHttpError | PublicApiNetworkError): ResendState {
  const state: ResendState = formStateFromResult(result, { screen: "sign-up-code" });
  const taken = phoneError(state);
  if (taken) return { status: "error", message: taken };
  if (result.kind === "http" && result.status === 429 && result.retryAfterSeconds) {
    state.resendAvailableAt = new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();
  }
  return state;
}

/** Asks for another code for the phone number in progress. */
export async function resendSignUpCode(deps: SignUpDeps): Promise<ResendState | Redirect> {
  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "none") return { redirect: AUTH_ROUTES.signUp };
  if (step.kind === "expired") return { redirect: EXPIRED };
  if (step.kind === "details") return { redirect: AUTH_ROUTES.signUpDetails };

  const { phone } = step.progress;
  const result = await deps.registration.sendCode(phone);
  if (!result.ok) return resendFailure(result);

  const { resendAvailableAt } = result.data;
  writeSignUpProgress(storage, { phone, resendAvailableAt });
  return { status: "success", message: "We sent you a new code.", resendAvailableAt };
}

/** Step 2: exchanges the code for the registration token and moves to the details step. */
export async function verifySignUpCode(values: { code: string }, deps: SignUpDeps): Promise<SignUpOutcome> {
  const parsed = otpSchema.safeParse({ code: values.code });
  if (!parsed.success) return validationError(parsed.error);

  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "none") return { redirect: AUTH_ROUTES.signUp };
  if (step.kind === "expired") return { redirect: EXPIRED };
  if (step.kind === "details") return { redirect: AUTH_ROUTES.signUpDetails };

  const { phone } = step.progress;
  const result = await deps.registration.verifyCode(phone, parsed.data.code);
  if (!result.ok) {
    const state = formStateFromResult(result, { screen: "sign-up-code" });
    // The code step has no phone input: a refusal of the number goes into the alert.
    const refused = phoneError(state);
    return refused ? { status: "error", message: refused } : state;
  }

  const { registrationToken, expiresAt } = result.data;
  if (!registrationToken) return { status: "error", message: AUTH_ERROR_TEXT.generic };
  writeSignUpProgress(storage, { phone, registrationToken, tokenExpiresAt: expiresAt });
  return { redirect: AUTH_ROUTES.signUpDetails };
}

export type SignUpDetailsValues = { fullName: string; password: string; confirmPassword: string };

/**
 * Last step: creates the account and signs in. The phone number and the registration token come from the progress
 * of this tab, never from the form, so the account can only be created for the verified number.
 * The state returned never holds a password.
 */
export async function completeSignUp(values: SignUpDetailsValues, deps: SignUpDeps): Promise<SignUpOutcome> {
  const kept = { fullName: values.fullName };
  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "none") return { redirect: AUTH_ROUTES.signUp };
  if (step.kind === "code") return { redirect: AUTH_ROUTES.signUpVerify };
  if (step.kind === "expired") return { redirect: EXPIRED };
  const { phone, registrationToken } = step.progress;

  // auth-browser-session §4.10: the session cookie of the new account could not be kept.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = signUpDetailsSchema.safeParse({
    fullName: values.fullName,
    password: values.password,
    confirmPassword: values.confirmPassword,
  });
  if (!parsed.success) return validationError(parsed.error, kept);

  // A logout still pending on this browser is sent (and its flag cleared) before the new sign-in replaces the cookie;
  // only by a submit that will send the registration, so a refused submit keeps the flag for the next retry.
  await deps.settlePending({ api: deps.api, jar: deps.jar });
  let result: Awaited<ReturnType<SignUpDeps["api"]["register"]>>;
  try {
    result = await deps.api.register({
      fullName: parsed.data.fullName,
      username: phone,
      email: "",
      idCardNumber: "",
      password: parsed.data.password,
      confirmPassword: parsed.data.confirmPassword,
      registrationToken,
    });
  } catch {
    // For example a missing API URL or a refused Web Lock: the progress stays for another try.
    return { status: "error", message: AUTH_ERROR_TEXT.generic, values: kept };
  }
  if (!result.ok) {
    // The token was used, expired or issued for another number: start over.
    if (result.kind === "http" && result.code === "REGISTRATION_TOKEN_INVALID") {
      clearSignUpProgress(storage);
      return { redirect: EXPIRED };
    }
    const state = formStateFromResult(result, { values: kept, screen: "generic" });
    // The form has no phone field: a number taken in the meantime is told in the alert instead.
    const taken = phoneError(state);
    return taken ? { status: "error", message: taken, values: kept } : state;
  }

  // Adopted in the same continuation as the answer: an await here would let another tab's refresh run in between
  // and see a different account behind the cookie than this tab knows.
  deps.store.adopt(result.data, { newSignIn: true });
  // The registration token is used up either way.
  clearSignUpProgress(storage);
  const { status, user } = deps.store.getSnapshot();
  if (status !== "signed-in" || !user) return { status: "error", message: AUTH_ERROR_TEXT.generic, values: kept };

  return { redirect: user.phoneVerified ? `${AUTH_ROUTES.account}?phone=verified` : AUTH_ROUTES.verifyPhone };
}
