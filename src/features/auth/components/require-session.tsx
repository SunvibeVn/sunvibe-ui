"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type SignOutEvent,
  type SignOutExit,
  exitView,
  loginRedirectUrl,
  nextExit,
  privateContentShown,
  rateLimitSeconds,
  sessionView,
} from "../lib/session-view";
import { documentJar, isLogoutPending } from "../session/browser-cookies";
import { retryPendingLogout, signOut } from "../session/logout";
import { privateViews } from "../session/private-views";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import { SignOutHereContext } from "../session/sign-out-here";
import { useSession } from "../session/use-session";
import { LogoutFailed } from "./logout-failed";
import { SessionEnded } from "./session-ended";
import { type SessionTexts, useSessionTexts } from "./session-screens";
import { SessionStatusText } from "./session-status-text";
import { SessionUnavailable } from "./session-unavailable";

type RequireSessionProps = { texts?: SessionTexts; children: ReactNode };

/** The login page that brings the user back here (path and query of this page). Only called in the browser. */
function loginUrlForHere(expired: boolean): string {
  return loginRedirectUrl(`${window.location.pathname}${window.location.search}`, expired);
}

/** Session end and sign-out leave with a replace navigation and a full page load (auth-browser-session §4.7). */
function leaveTo(url: string): void {
  window.location.replace(url);
}

function logoutStillPending(): boolean {
  try {
    return isLogoutPending(documentJar);
  } catch {
    return false;
  }
}

/**
 * Renders its children only for a signed-in session of this tab (auth-browser-session §6): loading while the session
 * is restored, the login page when nobody is signed in, the 401 screen while it leaves after the session expired, and
 * the retry block when the server could not be reached. It also owns "Sign out on this device" for the page (the
 * block's button and `useSignOutHere` in the content). `texts` replaces the Vietnamese texts on English screens.
 *
 * Next keeps a visited route mounted but hidden (React `<Activity>`) after a client-side navigation. While hidden the
 * private children are taken out, and on reveal the session is read again before anything paints; the marker tells
 * the cross-tab sync that this tab still holds a private view (auth-browser-session §4.5, §4.7).
 */
export function RequireSession({ texts, children }: RequireSessionProps) {
  const snapshot = useSession();
  const t = useSessionTexts(texts);
  const [exit, setExit] = useState<SignOutExit>("idle");
  // Read synchronously so a double click or a second caller starts nothing new.
  const exitRef = useRef<SignOutExit>("idle");
  const hasFailedText = t.logoutFailed !== undefined;
  const view = sessionView(snapshot);
  const [visible, setVisible] = useState(true);

  // React attaches this ref when the route is shown and detaches it when <Activity> hides the route, both in the
  // commit before paint, so the state change re-renders before anything shows.
  const markPrivateView = useCallback((marker: HTMLSpanElement | null) => {
    if (!marker) return;
    privateViews.register(marker);
    setVisible(true);
    return () => setVisible(false);
  }, []);

  const transition = useCallback((event: SignOutEvent): SignOutExit => {
    const before = exitRef.current;
    const after = nextExit(before, event);
    exitRef.current = after;
    if (after !== before) setExit(after);
    return after;
  }, []);

  // A protected page asks for the session at once; the snapshot, not the answer, decides what is shown.
  useEffect(() => {
    sessionStore.getAccessToken().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (exit === "leaving") {
      leaveTo("/");
      return;
    }
    if (exit !== "idle") return;
    if (view === "redirect-login") leaveTo(loginUrlForHere(false));
    else if (view === "redirect-expired") leaveTo(loginUrlForHere(true));
  }, [view, exit]);

  const signOutHere = useCallback((): void => {
    if (exitRef.current !== "idle") return;
    transition({ type: "start" });
    void signOut({ api: sessionApi, store: sessionStore, jar: documentJar }).then((result) => {
      transition({ type: "signed-out", result, hasFailedText });
    });
  }, [transition, hasFailedText]);

  const tryAgain = useCallback((): void => {
    if (exitRef.current !== "failed") return;
    transition({ type: "try-again" });
    void retryPendingLogout({ api: sessionApi, jar: documentJar }).then(() => {
      transition({ type: "retried", stillPending: logoutStillPending() });
    });
  }, [transition]);

  const shownExit = exitView(exit);
  let body: ReactNode;
  if (shownExit === "busy") body = <SessionStatusText text={t.loading} />;
  else if (shownExit === "logout-failed" && t.logoutFailed)
    body = (
      <LogoutFailed
        text={t.logoutFailed}
        tryAgainLabel={t.tryAgain ?? t.retry}
        onTryAgain={tryAgain}
        tryingAgain={exit === "retrying"}
      />
    );
  else if (view === "unavailable")
    body = (
      <SessionUnavailable
        texts={t}
        waitSeconds={rateLimitSeconds(snapshot)}
        onRetry={() => {
          sessionStore.retry().catch(() => undefined);
        }}
        onSignOut={signOutHere}
      />
    );
  else if (view === "loading") body = <SessionStatusText text={t.loading} />;
  else if (view === "redirect-login") body = <SessionStatusText text={t.leaving} />;
  else if (view === "redirect-expired") body = <SessionEnded texts={t} loginHref={loginUrlForHere(true)} />;
  else if (privateContentShown(view, visible)) body = children;
  else body = <SessionStatusText text={t.loading} />;

  return (
    <SignOutHereContext value={signOutHere}>
      <span hidden data-private-view="" ref={markPrivateView} />
      {body}
    </SignOutHereContext>
  );
}
