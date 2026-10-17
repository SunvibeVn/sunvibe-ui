import { RESET_STORAGE_KEY } from "../lib/reset-progress";
import { SIGN_UP_STORAGE_KEY } from "../lib/signup-progress";
import { type AuthMessage, broadcastAuth } from "./auth-channel";
import {
  type CookieJar,
  clearHint,
  clearLogoutPending,
  documentJar,
  isLogoutPending,
  newGeneration,
  readHint,
  setLogoutPending,
  writeHint,
} from "./browser-cookies";
import { withCookieLock } from "./cookie-lock";
import { type SessionApi, type SessionResponse, sessionApi } from "./session-api";

// The browser session of one tab (auth-browser-session §4.2). The access token lives only in this closure: never on
// the snapshot, in storage, in a log or on a global. The session is restored lazily through the refresh cookie when
// a page asks for a token, one refresh at a time per tab. Only a refresh 401 ends the session on its own
// (auth-browser-session BR-9); every other failure leaves it `unavailable` with the hint kept.

export type SessionUser = {
  userId: string;
  fullName: string;
  username: string;
  roles: readonly string[];
  phoneVerified: boolean;
  emailVerified: boolean;
};

export type SessionStatus = "signed-out" | "restoring" | "signed-in" | "unavailable";

export type SessionSnapshot = {
  status: SessionStatus;
  user: SessionUser | null;
  endedBy?: "expired" | "signed-out";
  retryAfterSeconds?: number;
};

export type SessionStoreDeps = {
  api: Pick<SessionApi, "refreshUnlocked" | "logoutUnlocked">;
  jar: CookieJar;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Runs the task under the browser-wide cookie lock; defaults to `withCookieLock`. */
  lock?: <T>(task: () => Promise<T>) => Promise<T>;
  broadcast(message: AuthMessage): void;
  /** Told after the store ended both sessions because another account was behind the refresh cookie. */
  onIdentityChange(): void;
  /** The tab's sessionStorage (sign-up and reset progress), read at call time; defaults to the global one. */
  sessionStorage?: () => Storage | null;
};

/** A token is renewed this long before the server says it expires, independent of the device clock. */
const TOKEN_EXPIRY_MARGIN_MS = 30_000;
/**
 * A refresh lost to a network error or timeout may have rotated the cookie on the server; retrying at about +2 s and
 * +12 s after the first failure keeps the last try inside the server's 30 s grace (auth-browser-session S-26).
 */
const RETRY_OFFSETS_MS = [2_000, 12_000] as const;

type RefreshResult = Awaited<ReturnType<SessionApi["refreshUnlocked"]>>;
/**
 * `dropped`: the cookies changed under the restore (another tab signed in or out). `superseded`: this tab replaced
 * its own state meanwhile (adopt, reset, unavailable). Neither result is used.
 */
type RestoreOutcome = "refreshed" | "ended" | "unavailable" | "dropped" | "superseded";

const REJECTED = Symbol("rejected");
const DROPPED = Symbol("dropped");
/** The refresh answered for another account; its session was already ended in the same lock hold. */
const IDENTITY_CHANGED = Symbol("identity-changed");
type Attempt = RefreshResult | typeof REJECTED;
type LockedResult = Attempt | typeof DROPPED | typeof IDENTITY_CHANGED;

type ParsedSession = { accessToken: string; expiresInMs: number; user: SessionUser };

function freezeUser(user: SessionUser): SessionUser {
  return Object.freeze({ ...user, roles: Object.freeze([...user.roles]) });
}

function parseSession(response: SessionResponse): ParsedSession | null {
  const { accessToken, expiresIn, user } = response;
  if (!accessToken || typeof expiresIn !== "number" || !user?.userId) return null;
  return {
    accessToken,
    expiresInMs: expiresIn * 1000,
    // The e-mail stays out of the summary: no page needs it from the store.
    user: freezeUser({
      userId: user.userId,
      fullName: user.fullName ?? "",
      username: user.username ?? "",
      roles: user.roles ?? [],
      phoneVerified: user.phoneVerified ?? false,
      emailVerified: user.emailVerified ?? false,
    }),
  };
}

const isNetworkFailure = (attempt: Attempt): boolean =>
  attempt !== REJECTED && !attempt.ok && attempt.kind === "network";

const globalSessionStorage = (): Storage | null => globalThis.sessionStorage ?? null;

export function createSessionStore(deps: SessionStoreDeps) {
  const { api, jar } = deps;
  const lock = deps.lock ?? (<T>(task: () => Promise<T>) => withCookieLock(task));
  const sessionStorageOf = deps.sessionStorage ?? globalSessionStorage;

  let snapshot: SessionSnapshot | undefined;
  let accessToken: string | null = null;
  let tokenExpiresAt = 0;
  let user: SessionUser | null = null;
  /** The sign-in generation this tab restored or adopted. */
  let bound: string | null = null;
  let inflight: Promise<RestoreOutcome> | null = null;
  /** Bumped whenever local state is replaced; a restore started before that is dropped on arrival. */
  let epoch = 0;
  const listeners = new Set<() => void>();

  /** The hint's generation, or null when nobody is signed in or a logout is pending. */
  const liveHint = (): string | null => {
    const hint = readHint(jar);
    return hint && !isLogoutPending(jar) ? hint : null;
  };

  // Read from the cookies on first use, never at construction (safe during server rendering).
  const current = (): SessionSnapshot => {
    snapshot ??= Object.freeze({ status: liveHint() ? "restoring" : "signed-out", user: null });
    return snapshot;
  };

  const publish = (
    status: SessionStatus,
    extras: { endedBy?: SessionSnapshot["endedBy"]; retryAfterSeconds?: number } = {},
  ): void => {
    snapshot = Object.freeze({
      status,
      user,
      ...(extras.endedBy ? { endedBy: extras.endedBy } : {}),
      ...(extras.retryAfterSeconds !== undefined ? { retryAfterSeconds: extras.retryAfterSeconds } : {}),
    });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One failing subscriber must not keep the others (or the caller's broadcast) from running.
      }
    }
  };

  /** Forgets any in-flight restore: its result is dropped and the next caller starts a new one. */
  const forgetRestore = (): void => {
    epoch += 1;
    inflight = null;
  };

  const dropToken = (): void => {
    accessToken = null;
    tokenExpiresAt = 0;
  };

  const keepSession = (parsed: ParsedSession): void => {
    accessToken = parsed.accessToken;
    tokenExpiresAt = deps.now() + parsed.expiresInMs - TOKEN_EXPIRY_MARGIN_MS;
    user = parsed.user;
  };

  const attemptRefresh = async (): Promise<Attempt> => {
    try {
      return await api.refreshUnlocked();
    } catch {
      // For example a missing API URL: nothing reached the server, so neither a retry nor a sign-out helps.
      return REJECTED;
    }
  };

  function markUnavailable(retryAfterSeconds?: number): void {
    current();
    // A late answer of a restore still in flight must not sign the store back in (auth-browser-session §4.3).
    forgetRestore();
    dropToken();
    publish("unavailable", { retryAfterSeconds });
  }

  /**
   * The sign-up and reset progress of this tab (a phone number, a registration or reset token) leaves with a session
   * end or a new sign-in, so on a shared PC it does not outlive the person who typed it. Best effort, never throws.
   */
  function clearFlowProgress(): void {
    for (const key of [SIGN_UP_STORAGE_KEY, RESET_STORAGE_KEY]) {
      try {
        sessionStorageOf()?.removeItem(key);
      } catch {
        // Blocked storage holds nothing to clear.
      }
    }
  }

  function endLocally(reason: "expired" | "signed-out"): void {
    current();
    forgetRestore();
    dropToken();
    user = null;
    bound = null;
    clearHint(jar);
    clearFlowProgress();
    publish("signed-out", { endedBy: reason });
    deps.broadcast({ type: "signed-out", generation: null });
  }

  function settle(result: Attempt, generation: string): RestoreOutcome {
    if (result === REJECTED) {
      markUnavailable();
      return "unavailable";
    }
    if (result.ok) {
      const parsed = parseSession(result.data);
      if (!parsed) {
        markUnavailable();
        return "unavailable";
      }
      writeHint(jar, generation);
      bound = generation;
      keepSession(parsed);
      publish("signed-in");
      return "refreshed";
    }
    if (result.kind === "http" && result.status === 401) {
      endLocally("expired");
      return "ended";
    }
    if (result.kind === "http" && result.status === 403) {
      console.error("Session refresh was refused with 403: this is a configuration error (API origin or CORS).");
    }
    markUnavailable(result.kind === "http" && result.status === 429 ? result.retryAfterSeconds : undefined);
    return "unavailable";
  }

  /** A refresh answer for another account than the user in memory (auth-browser-session S-25). */
  const isOtherAccount = (attempt: Attempt): boolean => {
    if (attempt === REJECTED || !attempt.ok || user === null) return false;
    const parsed = parseSession(attempt.data);
    return parsed !== null && parsed.user.userId !== user.userId;
  };

  /**
   * Ends the other account's session while this tab still holds the cookie lock, so a sign-in queued on the lock
   * meanwhile is never followed by this logout. The pending flag covers a failed call: the next page load retries it.
   */
  async function endOtherSessionUnlocked(): Promise<void> {
    try {
      setLogoutPending(jar);
    } catch {
      // Best effort: the logout below still runs.
    }
    let ended = false;
    try {
      ended = (await api.logoutUnlocked()).ok;
    } catch {
      // For example a missing API URL; the flag stays.
    }
    if (!ended) return;
    try {
      clearLogoutPending(jar);
    } catch {
      // Best effort, like the set: the flag stays and the next page load sends the logout again.
    }
  }

  /** After the lock: this tab signs out, unless a newer sign-in already wrote its hint (the sync resets the tab). */
  function endForOtherAccount(captured: string): RestoreOutcome {
    if (readHint(jar) !== captured) {
      dropToken();
      return "dropped";
    }
    endLocally("signed-out");
    deps.onIdentityChange();
    return "ended";
  }

  async function runRestore(): Promise<RestoreOutcome> {
    const captured = liveHint();
    if (!captured || (bound !== null && captured !== bound)) return "dropped";
    // auth-browser-session §4.2: a result is dropped when the hint vanished, its generation changed or a logout
    // became pending meanwhile (another tab signed out or in).
    const startedIn = epoch;
    const stale = () => epoch !== startedIn || readHint(jar) !== captured || isLogoutPending(jar);

    const refreshWithRetries = async (): Promise<Attempt | typeof DROPPED> => {
      if (stale()) return DROPPED;
      let attempt = await attemptRefresh();
      if (!isNetworkFailure(attempt)) return attempt;
      const firstFailureAt = deps.now();
      for (const offset of RETRY_OFFSETS_MS) {
        if (stale()) return DROPPED;
        await deps.sleep(Math.max(0, firstFailureAt + offset - deps.now()));
        if (stale()) return DROPPED;
        attempt = await attemptRefresh();
        if (!isNetworkFailure(attempt)) return attempt;
      }
      return attempt;
    };

    // One lock for the first try, its in-grace retries and the logout of another account: Web Locks are not
    // re-entrant.
    const result = await lockOrReject(async (): Promise<LockedResult> => {
      const attempt = await refreshWithRetries();
      if (attempt === DROPPED || !isOtherAccount(attempt)) return attempt;
      await endOtherSessionUnlocked();
      return IDENTITY_CHANGED;
    });

    // Settled outside the lock; the other account's token is never used.
    if (epoch !== startedIn) return "superseded";
    if (result === IDENTITY_CHANGED) return endForOtherAccount(captured);
    if (result === DROPPED || stale()) return "dropped";
    return settle(result, captured);
  }

  // A lock that cannot be taken (for example a SecurityError from Web Locks) counts like a rejected call.
  async function lockOrReject(task: () => Promise<LockedResult>): Promise<LockedResult> {
    try {
      return await lock(task);
    } catch {
      return REJECTED;
    }
  }

  /** The token in memory when it is unexpired and belongs to the sign-in the hint names now. */
  const usableToken = (): string | null => {
    const hint = liveHint();
    return accessToken !== null && deps.now() < tokenExpiresAt && hint !== null && hint === bound ? accessToken : null;
  };

  /**
   * A restore superseded by a reset of this tab, or dropped because another tab signed in meanwhile (the hint names a
   * newer sign-in than at the start), is followed by one fresh restore, unless that cannot help. Only for a caller
   * that was not bound to a sign-in yet (page load): a bound caller never gets another sign-in's token, and the
   * cross-tab sync does not reset a tab that is still restoring (auth-browser-session §4.5).
   */
  const canRestoreAfresh = (outcome: RestoreOutcome, hintAtStart: string | null): boolean => {
    const hint = liveHint();
    const retriable = outcome === "superseded" || (outcome === "dropped" && hint !== hintAtStart);
    return retriable && bound === null && hint !== null && current().status !== "unavailable";
  };

  function restore(): Promise<RestoreOutcome> {
    if (inflight) return inflight;
    const started: Promise<RestoreOutcome> = runRestore().finally(() => {
      if (inflight === started) inflight = null;
    });
    inflight = started;
    return started;
  }

  return {
    getSnapshot: (): SessionSnapshot => current(),

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** A valid token, restoring the session first when needed; null when there is no usable session. */
    async getAccessToken(): Promise<string | null> {
      // While unavailable nothing refreshes on its own; the page offers a retry (auth-browser-session S-17).
      if (current().status === "unavailable") return null;
      const hint = liveHint();
      if (!hint) return null;
      // A token of an older sign-in in this browser is never handed out; cross-tab sync resets this tab.
      if (bound !== null && hint !== bound) return null;
      if (accessToken !== null && deps.now() < tokenExpiresAt) return accessToken;
      const boundAtStart = bound;
      let outcome = await restore();
      // Not used because the state changed meanwhile (an adopt, a reset): answer from the current state, but only
      // with the sign-in this caller started under (or any, for a caller from before the first restore).
      if (outcome === "dropped" || outcome === "superseded") {
        const sameSignIn = boundAtStart === null || bound === boundAtStart;
        const token = sameSignIn ? usableToken() : null;
        if (token !== null) return token;
        if (boundAtStart === null && canRestoreAfresh(outcome, hint)) outcome = await restore();
      }
      return outcome === "refreshed" ? accessToken : null;
    },

    /**
     * After a 401 on a Bearer call: refreshes once, unless another caller already replaced `staleToken`.
     * "refreshed" only says a usable token of the current sign-in exists now. A caller that must know whether
     * `staleToken` belonged to that same sign-in captures `store.generation()` itself before its call and compares it
     * afterwards (only `callApi` does today).
     */
    async forceRefresh(staleToken: string): Promise<"refreshed" | "ended" | "unavailable"> {
      if (current().status === "unavailable") return "unavailable";
      const hint = liveHint();
      // Someone already replaced the token: it answers the call only while the hint still names this tab's sign-in.
      if (accessToken !== null && accessToken !== staleToken) {
        return bound !== null && hint === bound ? "refreshed" : "ended";
      }
      if (!hint || (bound !== null && hint !== bound)) return "ended";
      const boundAtStart = bound;
      dropToken();
      const outcome = await restore();
      if (outcome === "dropped" || outcome === "superseded") {
        // The call that got the 401 belongs to the sign-in it was sent under: a newer token of that same sign-in
        // (a password change in this tab) answers it; a reset or another sign-in ends it, with no second refresh.
        const hintNow = liveHint();
        const sameSignIn = boundAtStart !== null && bound === boundAtStart && hintNow === bound;
        if (sameSignIn && accessToken !== null && accessToken !== staleToken) return "refreshed";
        if (current().status === "unavailable") return "unavailable";
        return "ended";
      }
      if (outcome === "refreshed" || outcome === "unavailable") return outcome;
      return "ended";
    },

    /** Takes the session from a sign-in (`newSignIn: true`) or a password change in this tab (`false`). */
    adopt(response: SessionResponse, options: { newSignIn: boolean }): void {
      current();
      const parsed = parseSession(response);
      // Checked before any side effect: an incomplete answer writes no hint, binds nothing and tells no other tab.
      if (!parsed) {
        if (options.newSignIn) user = null;
        markUnavailable();
        return;
      }
      forgetRestore();
      if (options.newSignIn) {
        bound = newGeneration();
        writeHint(jar, bound);
        // auth-browser-session S-23: the new sign-in replaced the refresh cookie, so a pending logout retried later
        // would end the new session instead of the old one.
        clearLogoutPending(jar);
        clearFlowProgress();
      } else {
        bound ??= readHint(jar);
      }
      keepSession(parsed);
      publish("signed-in");
      if (options.newSignIn) deps.broadcast({ type: "signed-in", generation: bound });
    },

    endLocally,

    /**
     * Drops this tab's token, user and generation but keeps the cookies and tells no other tab: for a newer sign-in
     * seen in this browser (auth-browser-session §4.5). The next token request restores that sign-in.
     */
    resetLocal(): void {
      current();
      forgetRestore();
      dropToken();
      user = null;
      bound = null;
      publish(liveHint() ? "restoring" : "signed-out");
    },

    markUnavailable,

    /** The retry the page offers while unavailable: one new restore under the same rules. */
    async retry(): Promise<void> {
      current();
      dropToken();
      const hint = liveHint();
      if (!hint) {
        user = null;
        bound = null;
        publish("signed-out");
        return;
      }
      const boundAtStart = bound;
      publish("restoring");
      const outcome = await restore();
      // Another tab signed in while this retry waited: restore that sign-in once, as on page load.
      if (outcome === "dropped" && boundAtStart === null && canRestoreAfresh(outcome, hint)) await restore();
    },

    /** Updates the user summary (for example after the phone is verified); the user id never changes here. */
    updateUser(patch: Partial<SessionUser>): void {
      const { endedBy, retryAfterSeconds, status } = current();
      if (!user) return;
      user = freezeUser({ ...user, ...patch, userId: user.userId });
      publish(status, { endedBy, retryAfterSeconds });
    },

    generation: (): string | null => bound,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/** The tab's store. Safe to import during server rendering: cookies, locks and the channel resolve at call time. */
export const sessionStore: SessionStore = createSessionStore({
  api: sessionApi,
  jar: documentJar,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  lock: <T>(task: () => Promise<T>) => withCookieLock(task),
  broadcast: broadcastAuth,
  // auth-browser-session S-25: the store itself ends both sessions when another account is behind the refresh
  // cookie; this notification is for the view layer and needs nothing by default.
  onIdentityChange: () => {},
});
