"use server";

import { redirect } from "next/navigation";
import { clientContextHeaders } from "../lib/client-context";
import { authService } from "../services/auth.service";
import { clearSession, readSessionTokens } from "../session/cookies";

export async function logoutAction(): Promise<void> {
  const { refreshToken } = await readSessionTokens();
  if (refreshToken) {
    try {
      await authService.logout(refreshToken, { headers: await clientContextHeaders() });
    } catch (error) {
      // Signing out locally must never depend on the backend being up.
      console.error("[auth] Backend logout failed:", error instanceof Error ? error.message : error);
    }
  }
  await clearSession();
  redirect("/");
}
