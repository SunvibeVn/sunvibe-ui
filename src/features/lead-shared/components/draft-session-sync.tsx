"use client";

import { useDraftSessionSync } from "../lib/drafts";

/**
 * Feeds the session into the tab's workspace memory (drafts, the list notice, the last list URL), so all of it is
 * dropped on a sign-out or a user change anywhere in the app, also with no workspace form on screen (spec 5.2, C-33,
 * SEC-M2). Mounted once by the root layout inside `SessionProvider`; it must not sit inside `RequireSession`, which
 * takes its children out once the session is signed out. Renders nothing.
 */
export function DraftSessionSync() {
  useDraftSessionSync();
  return null;
}
