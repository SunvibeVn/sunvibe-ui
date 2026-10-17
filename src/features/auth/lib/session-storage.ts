// The tab's sessionStorage, shared by the sign-up and reset flows (auth-browser-session C-7).

/** The window's `sessionStorage`, or null when reading it throws (site data blocked). */
export function sessionStorageOf(source: { sessionStorage: Storage }): Storage | null {
  try {
    return source.sessionStorage;
  } catch {
    return null;
  }
}
