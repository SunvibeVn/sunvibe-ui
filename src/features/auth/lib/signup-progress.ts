import { AUTH_ROUTES } from "../constants";

// Sign-up progress of this tab (auth-browser-session C-7): kept in `sessionStorage`, so a reload in the same tab keeps
// it and a new tab starts over. It may hold the single-use registration token, never an access or refresh token.
// It lasts 30 minutes from the start of the sign-up, like the sign-up cookie it replaced, so a phone number typed on a
// shared PC does not stay behind for good. Every storage access is guarded: blocked storage reads as "no progress".
// Never logged.

export const SIGN_UP_STORAGE_KEY = "sv_signup";

/** How long the progress of one sign-up is kept, counted from its start. */
export const SIGN_UP_PROGRESS_MAX_AGE_MS = 30 * 60 * 1000;

export type SignUpProgress = {
  phone: string;
  resendAvailableAt?: string;
  registrationToken?: string;
  tokenExpiresAt?: string;
};

/** Where the sign-up of this tab stands. `expired`: the registration token ran out (and was cleared). */
export type SignUpStep =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "code"; progress: SignUpProgress }
  | { kind: "details"; progress: SignUpProgress };

/** True when `iso` (an ISO time from auth-service) is still ahead; false when missing or past. */
export function isFuture(iso?: string): boolean {
  return iso !== undefined && Date.parse(iso) > Date.now();
}

const optionalString = (value: unknown) => value === undefined || typeof value === "string";

/** The stored form: the progress and when its sign-up started (ms since the epoch). */
type StoredProgress = { progress: SignUpProgress; startedAt: number };

function parseStored(raw: string | null): StoredProgress | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { phone, resendAvailableAt, registrationToken, tokenExpiresAt, startedAt } = value as Record<string, unknown>;
  if (typeof phone !== "string" || !phone) return null;
  if (![resendAvailableAt, registrationToken, tokenExpiresAt].every(optionalString)) return null;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
  return {
    progress: {
      phone,
      ...(resendAvailableAt !== undefined && { resendAvailableAt: resendAvailableAt as string }),
      ...(registrationToken !== undefined && { registrationToken: registrationToken as string }),
      ...(tokenExpiresAt !== undefined && { tokenExpiresAt: tokenExpiresAt as string }),
    },
    startedAt,
  };
}

const isCurrent = (stored: StoredProgress, now: number) => now - stored.startedAt < SIGN_UP_PROGRESS_MAX_AGE_MS;

/** The progress, or null when there is none, it is unreadable or its sign-up started more than 30 minutes ago. */
function parse(raw: string | null): SignUpProgress | null {
  const stored = parseStored(raw);
  return stored && isCurrent(stored, Date.now()) ? stored.progress : null;
}

/** The stored text of `sv_signup`, or null when there is none or storage is blocked. */
export function readSignUpRaw(storage: Storage | null): string | null {
  try {
    return storage?.getItem(SIGN_UP_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The step the stored text stands for. Touches no storage. */
export function signUpStepOf(raw: string | null): SignUpStep {
  const progress = parse(raw);
  if (!progress) return { kind: "none" };
  if (!progress.registrationToken) return { kind: "code", progress };
  if (!isFuture(progress.tokenExpiresAt)) return { kind: "expired" };
  return { kind: "details", progress };
}

/** The step of this tab's sign-up; clears unreadable progress and an expired token. */
export function readSignUpStep(storage: Storage | null): SignUpStep {
  const raw = readSignUpRaw(storage);
  const step = signUpStepOf(raw);
  if (raw !== null && (step.kind === "none" || step.kind === "expired")) clearSignUpProgress(storage);
  return step;
}

/** Where a step page sends a visitor who skipped a step or whose token ran out; null when the page fits. */
export function signUpStepRedirect(step: SignUpStep, page: "code" | "details"): string | null {
  switch (step.kind) {
    case "none":
      return AUTH_ROUTES.signUp;
    case "expired":
      return `${AUTH_ROUTES.signUp}?expired=1`;
    case "code":
      return page === "code" ? null : AUTH_ROUTES.signUpVerify;
    case "details":
      return page === "details" ? null : AUTH_ROUTES.signUpDetails;
  }
}

/**
 * What a step page does once it has read the progress: sends a visitor who skipped a step, or whose token ran out, on
 * through `replace`. An expired registration token is cleared first: it is of no use any more. True when it left.
 */
export function leaveSignUpStep(
  step: SignUpStep,
  page: "code" | "details",
  deps: { storage: Storage | null; replace(path: string): void },
): boolean {
  const target = signUpStepRedirect(step, page);
  if (!target) return false;
  if (step.kind === "expired") clearSignUpProgress(deps.storage);
  deps.replace(target);
  return true;
}

/** The progress of this tab, or null when there is none (an expired token is cleared and reads as none). */
export function readSignUpProgress(storage: Storage | null): SignUpProgress | null {
  const step = readSignUpStep(storage);
  return step.kind === "code" || step.kind === "details" ? step.progress : null;
}

/**
 * Stores the progress. A later step of the same phone number keeps the start of its sign-up; `restart` (a new code
 * sent from the first step) or another number starts a new 30-minute lifetime.
 */
export function writeSignUpProgress(
  storage: Storage | null,
  progress: SignUpProgress,
  options: { restart?: boolean } = {},
): void {
  const now = Date.now();
  const previous = options.restart ? null : parseStored(readSignUpRaw(storage));
  const startedAt =
    previous && previous.progress.phone === progress.phone && isCurrent(previous, now) ? previous.startedAt : now;
  try {
    storage?.setItem(SIGN_UP_STORAGE_KEY, JSON.stringify({ ...progress, startedAt }));
  } catch {
    // Blocked or full storage: the flow carries on and a later step reads "no progress".
  }
}

export function clearSignUpProgress(storage: Storage | null): void {
  try {
    storage?.removeItem(SIGN_UP_STORAGE_KEY);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}
