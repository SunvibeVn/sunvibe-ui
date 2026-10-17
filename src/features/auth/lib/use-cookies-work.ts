"use client";

import { useSyncExternalStore } from "react";
import { cookiesAndStorageWork } from "../session/browser-cookies";

// auth-browser-session §4.10: sign-in, sign-up and password reset need a first-party cookie and `sessionStorage`.
// Checked once per page load (the check writes and removes a probe); the server render assumes they work, so a
// browser with cookies on never sees the notice flash.

let checked: boolean | undefined;
const read = () => (checked ??= cookiesAndStorageWork(window));
const subscribe = () => () => {};
const assumeTheyWork = () => true;

/** False when this browser keeps no first-party cookie or no `sessionStorage`. The form action checks again. */
export function useCookiesWork(): boolean {
  return useSyncExternalStore(subscribe, read, assumeTheyWork);
}
