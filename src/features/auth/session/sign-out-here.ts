"use client";

import { createContext, useContext } from "react";

/**
 * "Sign out on this device" of the protected page around the caller (given by `RequireSession`). Content must sign
 * out through it, not through `signOut` directly: signing out ends the session in this tab at once, and only
 * `RequireSession` knows to go to `/` (or show the logout-failed notice) instead of the login page.
 */
export const SignOutHereContext = createContext<(() => void) | null>(null);

/** The page's sign-out; only inside `RequireSession`. */
export function useSignOutHere(): () => void {
  const signOutHere = useContext(SignOutHereContext);
  if (!signOutHere) throw new Error("useSignOutHere must be used inside RequireSession");
  return signOutHere;
}
