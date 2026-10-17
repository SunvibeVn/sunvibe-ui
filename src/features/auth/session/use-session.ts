"use client";

import { useSyncExternalStore } from "react";
import { type SessionSnapshot, sessionStore } from "./session-store";

/**
 * The state the server renders and hydration starts from. The server cannot see whether anyone is signed in in this
 * browser, so it always renders "restoring"; one constant keeps the server snapshot stable between calls.
 */
const SERVER_SNAPSHOT: SessionSnapshot = Object.freeze({ status: "restoring", user: null });

const getServerSnapshot = (): SessionSnapshot => SERVER_SNAPSHOT;

/** The session of this tab (`{ status, user }`); re-renders when it changes. Never exposes the token. */
export function useSession(): SessionSnapshot {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, getServerSnapshot);
}
