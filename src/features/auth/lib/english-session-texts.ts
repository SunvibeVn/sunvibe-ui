import type { SessionTexts } from "./session-view";

// The session screens and blocks in English for the English auth screens `/account` and `/verify-phone`, so no
// screen mixes languages (auth-browser-session C-2, §7).

export const englishSessionTexts: SessionTexts = {
  loading: "Loading…",
  leaving: "Redirecting to log in…",
  // A short title: the body is the sentence, so the block does not say it twice.
  expiredTitle: "Session expired",
  expiredBody: "Your session has ended. Please log in again.",
  expiredLink: "Log in again",
  // No title (the Alert hides an empty one): the block shows the auth-browser-session §7 sentence once.
  unavailableTitle: "",
  unavailableBody: "We couldn't reach the server to restore your session. You're still signed in.",
  rateLimited: "Too many requests. Please wait {n} seconds and try again.",
  retry: "Try again",
  signOutHere: "Sign out on this device",
  logoutFailed: "You're signed out on this device, but we couldn't end your session on the server.",
  tryAgain: "Try again",
};
