"use client";

import { LogOutIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useSignOutHere } from "../session/sign-out-here";

/**
 * "Log out" of a protected page (auth-browser-session §4.6). `RequireSession` around it clears the private view, signs
 * out and goes to `/`, or shows the logout-failed warning; only inside `RequireSession`.
 */
export function LogoutButton() {
  const signOutHere = useSignOutHere();
  return (
    <Button variant="secondary" onClick={signOutHere}>
      <LogOutIcon size={16} />
      Log out
    </Button>
  );
}
