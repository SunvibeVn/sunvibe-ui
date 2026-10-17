"use client";

import type { ReactNode } from "react";
import { hasAnyRole } from "../lib/session-view";
import { useSession } from "../session/use-session";
import { Forbidden } from "./forbidden";

type RequireRoleProps = { anyOf: readonly string[]; children: ReactNode };

/**
 * Inside `RequireSession`: renders its children only for a user holding one of `anyOf` (a super admin also holds the
 * admin role, auth-roles BR-4). Anyone else gets the 403 screen and stays signed in. The API still checks the roles of
 * every call.
 */
export function RequireRole({ anyOf, children }: RequireRoleProps) {
  const { status, user } = useSession();
  if (status !== "signed-in" || !user) return null;
  if (!hasAnyRole(user.roles, anyOf)) return <Forbidden />;
  return children;
}
