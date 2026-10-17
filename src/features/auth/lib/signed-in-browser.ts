"use client";

import { callApi } from "../session/api-client";
import { sessionStore } from "../session/session-store";
import type { AccountDeps } from "./account-flow";
import type { VerifyPhoneDeps } from "./verify-phone-flow";

// The browser dependencies of `/account` and `/verify-phone`, resolved at call time: the tab's `callApi` and store.

/** The profile load of `/account`. */
export const accountDeps = (): AccountDeps => ({ callApi, store: sessionStore });

/** The phone verification flow. */
export const verifyPhoneDeps = (): VerifyPhoneDeps => ({ callApi, store: sessionStore, now: () => Date.now() });
