import type { components } from "@/api/generated/schema";
import { AUTH_ROUTES } from "../constants";
import { otpSchema } from "../schemas/auth.schema";
import type { CallApi } from "../session/api-client";
import type { SessionStore } from "../session/session-store";
import { readMe } from "./account-flow";
import { type FormState, formStateFromResult, validationError } from "./form-state";

// Phone verification of the signed-in user, from the browser with the tab's token (auth-browser-session §5
// `/verify-phone`). The session decides what the page shows when a call answers signed out or unavailable, so those
// answers show nothing here and never redirect. Nothing here logs; the code is never kept after the call.

export type CodeSentResponse = components["schemas"]["CodeSentResponse"];

export type VerifyPhoneDeps = {
  callApi: CallApi;
  store: Pick<SessionStore, "updateUser" | "markUnavailable" | "generation">;
  now: () => number;
};

export type Redirect = { redirect: string };

export type SendCodeState = FormState & { resendAvailableAt?: string };

export type VerifyPhoneLoad = { kind: "ready"; maskedPhone: string } | { kind: "session" } | { kind: "error" };

const IDLE: FormState = { status: "idle" };

function markVerified(deps: Pick<VerifyPhoneDeps, "store">): void {
  deps.store.updateUser({ phoneVerified: true });
}

/**
 * ALREADY_VERIFIED: the account of the call is verified. A late answer for an older sign-in must not mark the user who
 * replaced it as verified, so the session decides then (nothing shown, no redirect).
 */
function alreadyVerified(deps: Pick<VerifyPhoneDeps, "store">, generation: string | null): FormState | Redirect {
  if (deps.store.generation() !== generation) return IDLE;
  markVerified(deps);
  return { redirect: AUTH_ROUTES.account };
}

/** The page's start: an account whose phone is verified already goes to `/account`. */
export async function loadVerifyPhone(deps: VerifyPhoneDeps): Promise<VerifyPhoneLoad | Redirect> {
  const generation = deps.store.generation();
  const load = await readMe(deps);
  if (load.kind !== "ready") return load;
  if (load.me.phoneVerified) {
    // A late answer for an older sign-in must not mark the user who replaced it as verified.
    if (deps.store.generation() !== generation) return { kind: "session" };
    markVerified(deps);
    return { redirect: AUTH_ROUTES.account };
  }
  const phone = load.me.username ?? "";
  return { kind: "ready", maskedPhone: phone.replace(/\d(?=\d{3})/g, "•") };
}

/** Texts a code to the account's phone; after a 429 the resend button waits for `Retry-After`. */
export async function sendPhoneCode(deps: VerifyPhoneDeps): Promise<SendCodeState | Redirect> {
  const generation = deps.store.generation();
  const result = await deps.callApi((client) => client.POST("/api/v1/me/verification/phone/send-code"));
  if (result.ok) {
    return {
      status: "success",
      message: `We sent a 6-digit code to ${result.data.sentTo ?? ""}.`,
      resendAvailableAt: result.data.resendAvailableAt,
    };
  }
  if (result.kind === "signed-out" || result.kind === "unavailable") return IDLE;
  if (result.kind === "http" && result.code === "ALREADY_VERIFIED") return alreadyVerified(deps, generation);

  const state: SendCodeState = formStateFromResult(result, { screen: "generic" });
  if (result.kind === "http" && result.status === 429 && result.retryAfterSeconds) {
    state.resendAvailableAt = new Date(deps.now() + result.retryAfterSeconds * 1000).toISOString();
  }
  return state;
}

/** Confirms the typed code; the session's user then reads as verified in every part of the page. */
export async function confirmPhoneCode(values: { code: string }, deps: VerifyPhoneDeps): Promise<FormState | Redirect> {
  const parsed = otpSchema.safeParse({ code: values.code });
  if (!parsed.success) return validationError(parsed.error);
  const { code } = parsed.data;

  const generation = deps.store.generation();
  // `callApi` sends this again after a refresh, so the request (with the typed code) is built on every run.
  const result = await deps.callApi((client) =>
    client.POST("/api/v1/me/verification/phone/confirm-code", { body: { code } }),
  );
  if (result.ok) {
    markVerified(deps);
    return { redirect: `${AUTH_ROUTES.account}?phone=verified` };
  }
  if (result.kind === "signed-out" || result.kind === "unavailable") return IDLE;
  if (result.kind === "http" && result.code === "ALREADY_VERIFIED") return alreadyVerified(deps, generation);
  return formStateFromResult(result, { screen: "generic" });
}
