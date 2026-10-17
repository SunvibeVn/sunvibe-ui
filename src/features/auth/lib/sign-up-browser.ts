"use client";

import { useMemo, useSyncExternalStore } from "react";
import { documentJar } from "../session/browser-cookies";
import { settlePendingLogoutBeforeSignIn } from "../session/logout";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import { subscribePageReturn } from "./page-return";
import { sessionStorageOf } from "./session-storage";
import { registrationApi, type SignUpDeps } from "./sign-up-flow";
import { readSignUpRaw, type SignUpStep, signUpStepOf } from "./signup-progress";

/** The sign-up flow's browser dependencies, resolved at submit time: nothing reads `window` during server rendering. */
export const signUpBrowserDeps = (): SignUpDeps => ({
  registration: registrationApi,
  api: sessionApi,
  store: sessionStore,
  jar: documentJar,
  env: window,
  settlePending: settlePendingLogoutBeforeSignIn,
});

// sessionStorage fires no event in the tab that writes it: the step is read again when the page is shown again.
const subscribe = (notify: () => void) => subscribePageReturn({ window, document }, notify);
const readRaw = () => readSignUpRaw(sessionStorageOf(window));
const notMounted = () => undefined;

/** The sign-up step of this tab, or undefined while the page renders on the server or hydrates. */
export function useSignUpStep(): SignUpStep | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, notMounted);
  return useMemo(() => (raw === undefined ? undefined : signUpStepOf(raw)), [raw]);
}
