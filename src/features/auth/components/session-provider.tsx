"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { getAuthChannel } from "../session/auth-channel";
import { documentJar } from "../session/browser-cookies";
import { privateViews } from "../session/private-views";
import { startBrowserSession } from "../session/browser-session";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import { createResetPrivateViews } from "../session/session-sync";

/**
 * Finishes a pending logout and keeps every tab of the browser on the same sign-in (auth-browser-session §4.5-§4.7).
 * Renders its children only; reads no cookie or header on the server, so it changes nothing about how a page renders
 * there.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(
    () =>
      startBrowserSession({
        api: sessionApi,
        store: sessionStore,
        jar: documentJar,
        channel: getAuthChannel(),
        win: window,
        doc: document,
        resetPrivateViews: createResetPrivateViews({
          location: window.location,
          refresh: () => router.refresh(),
          privateViewMounted: () => privateViews.anyMounted(),
        }),
      }),
    [router],
  );

  return children;
}
