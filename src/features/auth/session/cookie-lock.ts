// One browser-wide Web Lock around every call that sets, reads or clears the refresh cookie, so a refresh in one
// tab and a sign-in in another never overwrite each other's cookie (auth-browser-session §4.2). Where Web Locks is
// missing (for example on a plain-http LAN origin) the task runs directly and the server's 30 s grace covers
// parallel refreshes.

export const COOKIE_LOCK_NAME = "sv-auth-cookie";

/** The part of `LockManager` this module uses, for one result type. */
export type CookieLock<T> = { request(name: string, callback: () => Promise<T>): Promise<T> };

/** A lock manager usable for any result type (`navigator.locks` fits through `browserLocks`). */
export type CookieLockManager = { request<U>(name: string, callback: () => Promise<U>): Promise<U> };

// Resolved at call time: nothing touches `navigator` while the module loads (server rendering).
function browserLocks(): CookieLockManager | undefined {
  const locks = globalThis.navigator?.locks;
  if (!locks) return undefined;
  // lib.dom types the result as Promise<Promise<U>>; the browser already resolves it to U, and `then` flattens.
  return { request: (name, callback) => locks.request(name, () => callback()).then((result) => result) };
}

export function withCookieLock<T>(
  task: () => Promise<T>,
  locks: CookieLock<T> | undefined = browserLocks(),
): Promise<T> {
  if (!locks) return task();
  return locks.request(COOKIE_LOCK_NAME, task);
}
