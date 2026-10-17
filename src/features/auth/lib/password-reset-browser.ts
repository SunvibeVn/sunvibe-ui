"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import type { FormState } from "./form-state";
import { type PasswordResetDeps, passwordResetApi, type Redirect } from "./password-reset-flow";
import { hasResetToken, type ResetSectionView, resetSectionView, takeTokenFromUrl } from "./reset-progress";
import { sessionStorageOf } from "./session-storage";

/** The reset flow's browser dependencies, resolved at submit time: nothing reads `window` during server rendering. */
export const passwordResetBrowserDeps = (): PasswordResetDeps => ({
  reset: passwordResetApi,
  api: sessionApi,
  store: sessionStore,
  env: window,
});

type Router = Pick<ReturnType<typeof useRouter>, "replace">;

/**
 * After a successful reset: the reset ended the session, so the page leaves with a replace navigation and a full page
 * load (auth-browser-session §4.7). Nothing of the form, its new password included, survives in a route that Next
 * keeps mounted. A form state stays on the page.
 */
export function leaveAfterReset(
  outcome: FormState | Redirect,
  location: Pick<Location, "replace"> = window.location,
): FormState {
  if (!("redirect" in outcome)) return outcome;
  location.replace(outcome.redirect);
  return { status: "success" };
}

/**
 * Moves the token of an e-mail link from the address into this tab's storage (auth-browser-session S-19) and
 * replaces the address through the router: a plain `history.replaceState` would leave the token in the router's own
 * URL, which a later refresh sends to the server and writes back to the address bar.
 */
export function moveResetTokenFromUrl({
  router,
  location = window.location,
  storage = sessionStorageOf(window),
}: {
  router: Router;
  /** Defaults to the page's address. */
  location?: { readonly href: string };
  /** Defaults to the tab's sessionStorage (null when blocked). */
  storage?: Storage | null;
}): void {
  const cleaned = takeTokenFromUrl(location, storage);
  if (cleaned !== null) router.replace(cleaned, { scroll: false });
}

const tokenInAddress = () => Boolean(new URL(window.location.href).searchParams.get("token"));

/** What the reset page shows; reads storage only once mounted, after moving the link token out of the address. */
export function useResetSectionView(fromLink: boolean): ResetSectionView {
  const router = useRouter();
  // Runs once the page has mounted: the token leaves the address, then the page reads the storage again.
  const subscribe = useCallback(
    (notify: () => void) => {
      moveResetTokenFromUrl({ router });
      notify();
      return () => {};
    },
    [router],
  );
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
  return useSyncExternalStore(subscribe, read, notMounted);
}
