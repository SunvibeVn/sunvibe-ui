import type { components } from "@/api/generated/schema";
import {
  createPublicClient,
  type PublicApiHttpError,
  type PublicApiNetworkError,
  type PublicApiResult,
  type PublicClientOptions,
} from "@/lib/api";
import { AUTH_ROUTES, EMAIL_SEND_TIMEOUT_MS } from "../constants";
import { otpSchema, signUpDetailsSchema, signUpEmailSchema } from "../schemas/auth.schema";
import { type BrowserEnvironment, type CookieJar, cookiesAndStorageWork } from "../session/browser-cookies";
import type { PendingLogoutDeps } from "../session/logout";
import type { SessionApi } from "../session/session-api";
import type { SessionStore, SessionUser } from "../session/session-store";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { type FieldErrors, type FormState, formStateFromResult, validationError } from "./form-state";
import { pathAfterSignIn } from "./login-flow";
import { createPublicAuthClient } from "./public-auth-client";
import { sessionStorageOf } from "./session-storage";
import {
  clearSignUpProgress,
  isFuture,
  readSignUpStep,
  type SignUpProgress,
  type SignUpStep,
  writeSignUpProgress,
} from "./signup-progress";

// "Verify first, register later" from the browser (auth-browser-session §5 sign-up, auth-email-access spec 6.2): the
// first step (/sign-up by email, /sign-up/phone by phone) → /sign-up/verify (the code) → /sign-up/details (name and
// password) → signed in. The last two steps serve both channels and read the channel from the progress, which lives in
// the tab's sessionStorage (auth-browser-session C-7). Every check runs inside these functions, not only on the
// buttons: React replays a submit made before hydration through the form action (auth-browser-session §4.9). Nothing
// here logs. The phone first step is in sign-up-phone-flow.ts, so public pages do not load the phone parser.

export type CodeSentResponse = components["schemas"]["CodeSentResponse"];
export type RegistrationTokenResponse = components["schemas"]["RegistrationTokenResponse"];

/** The anonymous registration calls (no cookie, no Authorization, no Web Lock). */
export type RegistrationApi = {
  sendCode(phoneNumber: string): Promise<PublicApiResult<CodeSentResponse>>;
  verifyCode(phoneNumber: string, code: string): Promise<PublicApiResult<RegistrationTokenResponse>>;
  sendEmailCode(email: string): Promise<PublicApiResult<CodeSentResponse>>;
  verifyEmailCode(email: string, code: string): Promise<PublicApiResult<RegistrationTokenResponse>>;
};

/** The registration calls through anonymous clients built at the first call (`options` and `build` for tests). */
export function createRegistrationApi(
  options: PublicClientOptions = {},
  build: (timeoutMs?: number) => ReturnType<typeof createPublicClient> = (timeoutMs) =>
    createPublicClient({ ...options, timeoutMs }),
): RegistrationApi {
  const send = createPublicAuthClient(() => build());
  const sendMail = createPublicAuthClient(() => build(EMAIL_SEND_TIMEOUT_MS));
  return {
    sendCode: (phoneNumber) =>
      send((client) => client.POST("/api/v1/auth/registration/phone/send-code", { body: { phoneNumber } })),
    verifyCode: (phoneNumber, code) =>
      send((client) => client.POST("/api/v1/auth/registration/phone/verify-code", { body: { phoneNumber, code } })),
    sendEmailCode: (email) =>
      sendMail((client) => client.POST("/api/v1/auth/registration/email/send-code", { body: { email } })),
    verifyEmailCode: (email, code) =>
      send((client) => client.POST("/api/v1/auth/registration/email/verify-code", { body: { email, code } })),
  };
}

export const registrationApi: RegistrationApi = createRegistrationApi();

export type SignUpDeps = {
  registration: RegistrationApi;
  api: Pick<SessionApi, "register" | "registerWithEmail" | "logout">;
  store: Pick<SessionStore, "adopt" | "getSnapshot">;
  jar: CookieJar;
  /** The page's `window` (or a window-like object), read at submit time. */
  env: BrowserEnvironment;
  settlePending: (deps: PendingLogoutDeps) => Promise<void>;
};

/** Why an address cannot go on: the form shows the way out instead of the code boxes (spec 4.8). */
export type SignUpConflict = "account-exists" | "not-available";

export type Redirect = { redirect: string };
export type SignUpState = FormState & { conflict?: SignUpConflict };
export type SignUpOutcome = SignUpState | Redirect;
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
export function phoneErrorsOnUsername(state: FormState): FormState {
  const phoneNumber = state.fieldErrors?.phoneNumber;
  if (!state.fieldErrors || !phoneNumber) return state;
  const fieldErrors: FieldErrors = { ...state.fieldErrors, username: [...(state.fieldErrors.username ?? []), ...phoneNumber] };
  delete fieldErrors.phoneNumber;
  return { ...state, fieldErrors };
}

export const storageOf = (deps: Pick<SignUpDeps, "env">) => sessionStorageOf(deps.env);

/**
 * The first step of a sign-up for `sameAs`: coming back with the same address or number must not cost another code, so
 * the visitor carries on where they left off. Anything else drops the code and the token at once, also when the new
 * code then fails: a proof never outlives the value it proves (auth-email-access US-1 AC-2).
 */
export function resumeOrDropSignUp(
  storage: Storage | null,
  step: SignUpStep,
  sameAs: (progress: SignUpProgress) => boolean,
): Redirect | null {
  if (step.kind !== "code" && step.kind !== "details") return null;
  if (sameAs(step.progress)) {
    if (step.kind === "details") return { redirect: AUTH_ROUTES.signUpDetails };
    if (isFuture(step.progress.resendAvailableAt)) return { redirect: AUTH_ROUTES.signUpVerify };
    return null;
  }
  clearSignUpProgress(storage);
  return null;
}

/** Step 1 by email: mails a code to the address and moves to the code step. */
export async function startSignUp(values: { email: string }, deps: SignUpDeps): Promise<SignUpOutcome> {
  const kept = { email: values.email };
  // auth-browser-session §4.10: without a working cookie and sessionStorage the sign-up cannot finish, so send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = signUpEmailSchema.safeParse(kept);
  if (!parsed.success) return validationError(parsed.error, kept);
  const { email } = parsed.data;

  const storage = storageOf(deps);
  const sameEmail = (progress: SignUpProgress) => progress.channel === "EMAIL" && progress.email === email;
  const resumed = resumeOrDropSignUp(storage, readSignUpStep(storage), sameEmail);
  if (resumed) return resumed;

  const result = await deps.registration.sendEmailCode(email);
  if (!result.ok) return formStateFromResult(result, { values: kept, screen: "generic" });

  writeSignUpProgress(storage, { channel: "EMAIL", email, resendAvailableAt: result.data.resendAvailableAt }, { restart: true });
  return { redirect: AUTH_ROUTES.signUpVerify };
}

function resendFailure(result: PublicApiHttpError | PublicApiNetworkError): ResendState {
  const state: ResendState = formStateFromResult(result, { screen: "sign-up-code" });
  const taken = phoneError(state);
  if (taken) return { status: "error", message: taken };
  // Only a 429 waits: after a mail failure nothing was sent, so no cooldown was charged and a retry may go at once.
  if (result.kind === "http" && result.status === 429 && result.retryAfterSeconds) {
    state.resendAvailableAt = new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();
  }
  return state;
}

const sendCodeFor = (progress: SignUpProgress, deps: SignUpDeps) =>
  progress.channel === "EMAIL"
    ? deps.registration.sendEmailCode(progress.email)
    : deps.registration.sendCode(progress.phone);

const verifyCodeFor = (progress: SignUpProgress, code: string, deps: SignUpDeps) =>
  progress.channel === "EMAIL"
    ? deps.registration.verifyEmailCode(progress.email, code)
    : deps.registration.verifyCode(progress.phone, code);

/** The same sign-up with only these proofs: a new step never carries an older one along. */
const withProof = (
  progress: SignUpProgress,
  proof: Pick<SignUpProgress, "resendAvailableAt" | "registrationToken" | "tokenExpiresAt">,
): SignUpProgress =>
  progress.channel === "EMAIL"
    ? { channel: "EMAIL", email: progress.email, ...proof }
    : { channel: "PHONE", phone: progress.phone, ...proof };

/** Asks for another code for the address or number in progress. */
export async function resendSignUpCode(deps: SignUpDeps): Promise<ResendState | Redirect> {
  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "none") return { redirect: AUTH_ROUTES.signUp };
  if (step.kind === "expired") return { redirect: EXPIRED };
  if (step.kind === "details") return { redirect: AUTH_ROUTES.signUpDetails };

  const result = await sendCodeFor(step.progress, deps);
  if (!result.ok) return resendFailure(result);

  const { resendAvailableAt } = result.data;
  writeSignUpProgress(storage, withProof(step.progress, { resendAvailableAt }));
  return { status: "success", message: "We sent you a new code.", resendAvailableAt };
}

/** The result of a proved mailbox that cannot sign up (spec 4.8), or null for any other refusal. */
function emailConflict(result: PublicApiHttpError | PublicApiNetworkError): SignUpState | null {
  if (result.kind !== "http") return null;
  if (result.code === "EMAIL_ACCOUNT_EXISTS") {
    return { status: "error", message: AUTH_ERROR_TEXT.emailAccountExists, conflict: "account-exists" };
  }
  if (result.code === "EMAIL_NOT_AVAILABLE") {
    return { status: "error", message: AUTH_ERROR_TEXT.emailNotAvailable, conflict: "not-available" };
  }
  return null;
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

  const result = await verifyCodeFor(step.progress, parsed.data.code, deps);
  if (!result.ok) {
    const conflict = emailConflict(result);
    if (conflict) {
      // The code is used up and this address goes no further: nothing of it stays in the tab.
      clearSignUpProgress(storage);
      return conflict;
    }
    const state = formStateFromResult(result, { screen: "sign-up-code" });
    // The code step has no phone input: a refusal of the number goes into the alert.
    const refused = phoneError(state);
    return refused ? { status: "error", message: refused } : state;
  }

  const { registrationToken, expiresAt } = result.data;
  if (!registrationToken) return { status: "error", message: AUTH_ERROR_TEXT.generic };
  writeSignUpProgress(storage, withProof(step.progress, { registrationToken, tokenExpiresAt: expiresAt }));
  return { redirect: AUTH_ROUTES.signUpDetails };
}

export type SignUpDetailsValues = { fullName: string; password: string; confirmPassword: string };

type VerifiedDetails = { fullName: string; password: string; confirmPassword: string };

const register = (progress: SignUpProgress, details: VerifiedDetails, deps: SignUpDeps) => {
  const registrationToken = progress.registrationToken ?? "";
  if (progress.channel === "EMAIL") {
    return deps.api.registerWithEmail({ ...details, email: progress.email, registrationToken });
  }
  return deps.api.register({ ...details, username: progress.phone, idCardNumber: "", registrationToken });
};

const pathAfterSignUp = (progress: SignUpProgress, user: SessionUser): string => {
  if (user.requiredAction) return pathAfterSignIn(user);
  return progress.channel === "PHONE" ? `${AUTH_ROUTES.account}?phone=verified` : AUTH_ROUTES.account;
};

async function finishSignUp(values: SignUpDetailsValues, deps: SignUpDeps): Promise<SignUpOutcome> {
  const kept = { fullName: values.fullName };
  const storage = storageOf(deps);
  const step = readSignUpStep(storage);
  if (step.kind === "none") return { redirect: AUTH_ROUTES.signUp };
  if (step.kind === "code") return { redirect: AUTH_ROUTES.signUpVerify };
  if (step.kind === "expired") return { redirect: EXPIRED };
  const { progress } = step;

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
    result = await register(progress, parsed.data, deps);
  } catch {
    // For example a missing API URL or a refused Web Lock: the progress stays for another try.
    return { status: "error", message: AUTH_ERROR_TEXT.generic, values: kept };
  }
  if (!result.ok) {
    // The token was used, expired or issued for another address or number: start over.
    if (result.kind === "http" && result.code === "REGISTRATION_TOKEN_INVALID") {
      clearSignUpProgress(storage);
      return { redirect: EXPIRED };
    }
    const conflict = emailConflict(result);
    if (conflict) return { ...conflict, values: kept };
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

  return { redirect: pathAfterSignUp(progress, user) };
}

/** The registration in flight, by the API that sends it: a token works once, so one submit may run at a time. */
const finishing = new WeakMap<object, Promise<SignUpOutcome>>();

/**
 * Last step: creates the account and signs in. The address or number and the registration token come from the progress
 * of this tab, never from the form, so the account can only be created for what was verified. A second submit while the
 * first runs shares its result (auth-email-access Review Focus 2). The state returned never holds a password.
 */
export function completeSignUp(values: SignUpDetailsValues, deps: SignUpDeps): Promise<SignUpOutcome> {
  const running = finishing.get(deps.api);
  if (running) return running;
  const started = finishSignUp(values, deps).finally(() => finishing.delete(deps.api));
  finishing.set(deps.api, started);
  return started;
}
