"use client";

import { callApi } from "../session/api-client";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import type { AccountEmailDeps } from "./account-email-flow";
import type { AccountDeps } from "./account-flow";
import type { VerifyPhoneDeps } from "./verify-phone-flow";

// The browser dependencies of `/account`, `/account/email` and `/verify-phone`, resolved at call time: the tab's
// `callApi` and store.

/** The profile load of `/account`. */
export const accountDeps = (): AccountDeps => ({ callApi, store: sessionStore });

/** Bind or replace the account email. */
export const accountEmailDeps = (): AccountEmailDeps => ({ callApi, api: sessionApi, store: sessionStore, env: window });

/** The phone verification flow. */
export const verifyPhoneDeps = (): VerifyPhoneDeps => ({ callApi, store: sessionStore, now: () => Date.now() });
