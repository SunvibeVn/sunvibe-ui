import { legacyPhoneLoginSchema, phoneLoginSchema } from "../schemas/phone-auth.schema";
import { cookiesAndStorageWork } from "../session/browser-cookies";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { validationError } from "./form-state";
import { type LoginDeps, type LoginOutcome, sendSignIn } from "./login-flow";
import type { PhoneMode } from "./phone-mode";

export type PhoneLoginValues = { username: string; password: string; next?: string };

/**
 * Signs in with phone and password (`/login/phone`). In `legacy-login` the value skips the parser: a row without a key
 * keeps its way in by its stored string, which the policy may refuse (auth-email-access D4-7). The API decides. Every
 * check runs here, not only on the button: React replays a submit made before hydration through this action.
 */
export async function submitPhoneLogin(values: PhoneLoginValues, mode: PhoneMode, deps: LoginDeps): Promise<LoginOutcome> {
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired };

  const kept = { username: values.username };
  const schema = mode === "on" ? phoneLoginSchema : legacyPhoneLoginSchema;
  const parsed = schema.safeParse({ username: values.username, password: values.password });
  if (!parsed.success) return validationError(parsed.error, kept);

  return sendSignIn(parsed.data, { kept, next: values.next, screen: "phone-login" }, deps);
}
