import { AUTH_ROUTES } from "../constants";
import { signUpPhoneSchema } from "../schemas/phone-auth.schema";
import { cookiesAndStorageWork } from "../session/browser-cookies";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { formStateFromResult, validationError } from "./form-state";
import {
  phoneErrorsOnUsername,
  resumeOrDropSignUp,
  type SignUpDeps,
  type SignUpOutcome,
  storageOf,
} from "./sign-up-flow";
import { readSignUpStep, type SignUpProgress, writeSignUpProgress } from "./signup-progress";

/** Step 1 by phone (`/sign-up/phone`): texts a code to the number and moves to the shared code step. */
export async function startPhoneSignUp(values: { username: string }, deps: SignUpDeps): Promise<SignUpOutcome> {
  const kept = { username: values.username };
  // auth-browser-session §4.10: without a working cookie and sessionStorage the sign-up cannot finish, so send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = signUpPhoneSchema.safeParse(kept);
  if (!parsed.success) return validationError(parsed.error, kept);
  const phone = parsed.data.username;

  const storage = storageOf(deps);
  const samePhone = (progress: SignUpProgress) => progress.channel === "PHONE" && progress.phone === phone;
  const resumed = resumeOrDropSignUp(storage, readSignUpStep(storage), samePhone);
  if (resumed) return resumed;

  const result = await deps.registration.sendCode(phone);
  // A taken number comes back as a field error, shown under the phone input.
  if (!result.ok) return phoneErrorsOnUsername(formStateFromResult(result, { values: kept, screen: "generic" }));

  writeSignUpProgress(storage, { channel: "PHONE", phone, resendAvailableAt: result.data.resendAvailableAt }, { restart: true });
  return { redirect: AUTH_ROUTES.signUpVerify };
}
