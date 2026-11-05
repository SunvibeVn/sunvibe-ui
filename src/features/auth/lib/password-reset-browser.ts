"use client";

import { useCallback, useSyncExternalStore } from "react";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import { type PasswordResetDeps, passwordResetApi, type Redirect, type ResetState } from "./password-reset-flow";
import { hasResetToken, type ResetSectionView, resetSectionView, takeTokenFromUrl } from "./reset-progress";
import { sessionStorageOf } from "./session-storage";

/** The reset flow's browser dependencies, resolved at submit time: nothing reads `window` during server rendering. */
export const passwordResetBrowserDeps = (): PasswordResetDeps => ({
  reset: passwordResetApi,
  api: sessionApi,
  store: sessionStore,
  env: window,
});

/**
 * After a successful reset: the reset ended the session, so the page leaves with a replace navigation and a full page
 * load (auth-browser-session §4.7). Nothing of the form, its new password included, survives in a route that Next
 * keeps mounted. A form state stays on the page.
 */
export function leaveAfterReset(
  outcome: ResetState | Redirect,
  location: Pick<Location, "replace"> = window.location,
): ResetState {
  if (!("redirect" in outcome)) return outcome;
  location.replace(outcome.redirect);
  return { status: "success" };
}

/**
 * Moves the token of an e-mail link from the address into this tab's storage, then leaves for the same page in a new
 * document. Neither `router.replace` nor `history.replaceState` can do it: the router keeps the first URL, fragment
 * included, in its route cache and writes it back on a production server (`next dev` hides this; see
 * e2e/reset-link-address.spec.ts). A replace also takes the token out of the tab's history.
 */
export function moveResetTokenFromUrl({
  location = window.location,
  storage = sessionStorageOf(window),
}: {
  /** Defaults to the page's address. */
  location?: Pick<Location, "href" | "replace">;
  /** Defaults to the tab's sessionStorage (null when blocked). */
  storage?: Storage | null;
} = {}): void {
  const cleaned = takeTokenFromUrl(location, storage);
  if (cleaned !== null) location.replace(cleaned);
}

const tokenInAddress = () => Boolean(new URLSearchParams(window.location.hash.slice(1)).get("token"));

/** Runs once the page has mounted, and again for a link opened in this same tab, which loads no new document. */
function watchTokenInAddress(notify: () => void): () => void {
  const move = () => {
    moveResetTokenFromUrl();
    notify();
  };
  move();
  window.addEventListener("hashchange", move);
  return () => window.removeEventListener("hashchange", move);
}

/** What the reset page shows; reads storage only once mounted, after moving the link token out of the address. */
export function useResetSectionView(fromLink: boolean): ResetSectionView {
  const read = useCallback(
    () =>
      resetSectionView({
        mounted: true,
        fromLink,
        stored: hasResetToken(sessionStorageOf(window)),
        tokenInAddress: tokenInAddress(),
      }),
    [fromLink],
  );
  const notMounted = useCallback(
    () => resetSectionView({ mounted: false, fromLink, stored: false, tokenInAddress: false }),
    [fromLink],
  );
  return useSyncExternalStore(watchTokenInAddress, read, notMounted);
}
