import { RESET_TOKEN_MAX_AGE_SECONDS, SMS_RESEND_COOLDOWN_SECONDS } from "../constants";

// Password-reset progress of this tab (auth-browser-session C-7): the single-use reset token lives in
// `sessionStorage` for at most 15 minutes, so a reload in the same tab keeps it and a new tab starts over. It never
// holds an access or refresh token. Every storage access is guarded: blocked storage reads as "no token". Never logged.

export const RESET_STORAGE_KEY = "sv_reset";

export type ResetProgress = {
  token: string;
  /** The phone number of an SMS reset; missing for a token taken from an e-mail link. */
  phone?: string;
  /** When the token was stored (ms since the epoch). */
  issuedAt: number;
};

const MAX_AGE_MS = RESET_TOKEN_MAX_AGE_SECONDS * 1000;
const COOLDOWN_MS = SMS_RESEND_COOLDOWN_SECONDS * 1000;

function parse(raw: string | null): ResetProgress | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { token, phone, issuedAt } = value as Record<string, unknown>;
  if (typeof token !== "string" || !token) return null;
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return null;
  if (phone !== undefined && typeof phone !== "string") return null;
  return { token, ...(phone !== undefined && { phone }), issuedAt };
}

function readRaw(storage: Storage | null): string | null {
  try {
    return storage?.getItem(RESET_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

const isFresh = (progress: ResetProgress, now: number) => now - progress.issuedAt < MAX_AGE_MS;

/** True when this tab holds a usable reset token. Changes nothing. */
export function hasResetToken(storage: Storage | null, now: number = Date.now()): boolean {
  const progress = parse(readRaw(storage));
  return progress !== null && isFresh(progress, now);
}

/** The reset progress of this tab, or null; unreadable progress and an entry older than 15 minutes are cleared. */
export function readResetProgress(storage: Storage | null, now: number = Date.now()): ResetProgress | null {
  const raw = readRaw(storage);
  const progress = parse(raw);
  if (progress && isFresh(progress, now)) return progress;
  if (raw !== null) clearResetProgress(storage);
  return null;
}

/**
 * Stores a reset token. Inside auth-service's 60 s resend cooldown a second request for the same phone answers with a
 * decoy token and sends no SMS, so the stored real token (whose code is on its way) is kept then.
 */
export function saveResetToken(
  storage: Storage | null,
  token: string,
  phone: string | undefined,
  now: number = Date.now(),
): void {
  const existing = readResetProgress(storage, now);
  if (phone !== undefined && existing?.phone === phone && now - existing.issuedAt < COOLDOWN_MS) return;
  const progress: ResetProgress = { token, ...(phone !== undefined && { phone }), issuedAt: now };
  try {
    storage?.setItem(RESET_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Blocked or full storage: the reset page then reads "no token" and offers a new code.
  }
}

export function clearResetProgress(storage: Storage | null): void {
  try {
    storage?.removeItem(RESET_STORAGE_KEY);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

/**
 * Moves the token of an e-mail reset link (`?token=`) into this tab's storage (auth-browser-session S-19). Returns the
 * address without the token (other parameters and the hash kept) for the caller to navigate to through the router, so
 * the router's own URL drops the token too; null when the address carries no token. An empty token is not stored.
 */
export function takeTokenFromUrl(
  location: { readonly href: string },
  storage: Storage | null,
  now: number = Date.now(),
): string | null {
  const url = new URL(location.href);
  if (!url.searchParams.has("token")) return null;
  const token = url.searchParams.get("token");
  if (token) saveResetToken(storage, token, undefined, now);
  url.searchParams.delete("token");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What the reset page shows: the form, the invalid-link notice, or a placeholder until it knows. */
export type ResetSectionView = "form" | "invalid" | "pending";

/**
 * Before mount (server render and hydration) the form shows when the address came from a reset link (`fromLink`), so a
 * submit before hydration works; otherwise a placeholder. Once mounted: the form when this tab holds a usable token, or
 * while a token still waits in the address (moved right after mount); else the invalid-link notice.
 */
export function resetSectionView({
  mounted,
  fromLink,
  stored,
  tokenInAddress,
}: {
  mounted: boolean;
  fromLink: boolean;
  stored: boolean;
  tokenInAddress: boolean;
}): ResetSectionView {
  if (!mounted) return fromLink ? "form" : "pending";
  return stored || tokenInAddress ? "form" : "invalid";
}
