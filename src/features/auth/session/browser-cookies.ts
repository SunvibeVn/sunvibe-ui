// Browser-side cookies of the session (auth-browser-session §4.1, §4.4): the sign-in hint and the
// logout-pending flag, both on the FE host and readable by script. They never hold a token; the hint
// only says whether a refresh is worth trying (auth-browser-session BR-8: never used for authorization).

const HINT_BASE_NAME = "sv_signed_in";
const PENDING_BASE_NAME = "sv_logout_pending";
const COOKIE_CHECK_NAME = "sv_cookie_check";
const STORAGE_CHECK_KEY = "sv_storage_check";
/** Seven days, like the refresh cookie's idle lifetime. */
const MAX_AGE_SECONDS = 604_800;

/** Cookies the old server-side session set on the FE host; the proxy expires them. */
export const LEGACY_FE_COOKIES = ["sv_at", "sv_rt", "__Host-sv_at", "__Host-sv_rt", "sv_signup", "sv_reset"] as const;

/** `document` fits. */
export type CookieJar = { cookie: string };

/**
 * The page's `document.cookie`, resolved at each access: safe to import during server rendering, where it reads
 * as empty and ignores writes.
 */
export const documentJar: CookieJar = {
  get cookie(): string {
    return typeof document === "undefined" ? "" : document.cookie;
  },
  set cookie(value: string) {
    if (typeof document !== "undefined") document.cookie = value;
  },
};

const isProductionBuild = () => process.env.NODE_ENV === "production";

function prefixed(base: string, production: boolean): string {
  return production ? `__Host-${base}` : base;
}

export function hintCookieName(production: boolean = isProductionBuild()): string {
  return prefixed(HINT_BASE_NAME, production);
}

export function pendingCookieName(production: boolean = isProductionBuild()): string {
  return prefixed(PENDING_BASE_NAME, production);
}

function readCookie(jar: CookieJar, name: string): string | null {
  for (const part of jar.cookie.split(";")) {
    const entry = part.trim();
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator) !== name) continue;
    return entry.slice(separator + 1);
  }
  return null;
}

// Lax, not Strict: a Strict hint is missing on the first page opened from a Zalo or e-mail link.
function writeCookie(jar: CookieJar, name: string, value: string, maxAge: number, production: boolean): void {
  const attributes = [`${name}=${value}`, "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (production) attributes.push("Secure");
  jar.cookie = attributes.join("; ");
}

/** The sign-in generation of this browser, or null when nobody is signed in. */
export function readHint(jar: CookieJar, production: boolean = isProductionBuild()): string | null {
  const value = readCookie(jar, hintCookieName(production));
  return value ? value : null;
}

export function writeHint(jar: CookieJar, generation: string, production: boolean = isProductionBuild()): void {
  writeCookie(jar, hintCookieName(production), generation, MAX_AGE_SECONDS, production);
}

export function clearHint(jar: CookieJar, production: boolean = isProductionBuild()): void {
  writeCookie(jar, hintCookieName(production), "", 0, production);
}

export function isLogoutPending(jar: CookieJar, production: boolean = isProductionBuild()): boolean {
  return readCookie(jar, pendingCookieName(production)) === "1";
}

export function setLogoutPending(jar: CookieJar, production: boolean = isProductionBuild()): void {
  writeCookie(jar, pendingCookieName(production), "1", MAX_AGE_SECONDS, production);
}

export function clearLogoutPending(jar: CookieJar, production: boolean = isProductionBuild()): void {
  writeCookie(jar, pendingCookieName(production), "", 0, production);
}

type RandomSource = { getRandomValues(array: Uint8Array): Uint8Array };

/**
 * A new random sign-in generation id: 16 random bytes as 32 hex characters. Uses `getRandomValues`
 * because `crypto.randomUUID` is missing on plain-http LAN origins.
 */
export function newGeneration(random: RandomSource = globalThis.crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type BrowserEnvironment = {
  navigator: { cookieEnabled: boolean };
  document: CookieJar;
  sessionStorage: Storage;
};

/**
 * True when the browser keeps a first-party cookie and `sessionStorage` works (auth-browser-session §4.10:
 * sign-in, sign-up and password reset refuse to send otherwise). Leaves nothing behind.
 *
 * Pass `window` (or a window-like object): every property is read inside the `try`, because reading
 * `window.sessionStorage` itself throws a SecurityError when site data is blocked.
 */
export function cookiesAndStorageWork(env: BrowserEnvironment): boolean {
  try {
    if (!env.navigator.cookieEnabled) return false;
    const probe = Date.now().toString(36);
    env.document.cookie = `${COOKIE_CHECK_NAME}=${probe}; Path=/; SameSite=Lax`;
    const kept = readCookie(env.document, COOKIE_CHECK_NAME) === probe;
    env.document.cookie = `${COOKIE_CHECK_NAME}=; Path=/; SameSite=Lax; Max-Age=0`;
    if (!kept) return false;

    env.sessionStorage.setItem(STORAGE_CHECK_KEY, probe);
    const stored = env.sessionStorage.getItem(STORAGE_CHECK_KEY) === probe;
    env.sessionStorage.removeItem(STORAGE_CHECK_KEY);
    return stored;
  } catch {
    return false;
  }
}
