import { NextResponse, type NextRequest } from "next/server";
import { forwardedHeaders } from "./lib/forwarded-headers";
import { refreshSession } from "./services/auth-api";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  sessionCookieNames,
} from "./session/cookie-config";
import { refreshIfNeeded } from "./session/refresh";
import { guardRedirect } from "./session/route-guard";

// Public entry point for src/proxy.ts. Keep it free of React and next/headers.

export async function authProxy(
  request: NextRequest,
  refresh: typeof refreshSession = refreshSession,
): Promise<NextResponse> {
  const names = sessionCookieNames();
  const tokens = {
    access: request.cookies.get(names.access)?.value || undefined,
    refresh: request.cookies.get(names.refresh)?.value || undefined,
  };
  const outcome = await refreshIfNeeded(tokens, forwardedHeaders(request.headers), refresh);

  let signedIn = Boolean(tokens.access || tokens.refresh);
  if (outcome.kind === "refreshed") {
    // Also update the forwarded request so this very render sees the new token.
    request.cookies.set(names.access, outcome.session.accessToken);
    request.cookies.set(names.refresh, outcome.session.refreshToken);
  } else if (outcome.kind === "expired") {
    request.cookies.delete(names.access);
    request.cookies.delete(names.refresh);
    signedIn = false;
  }

  const redirectTo = guardRedirect(request.nextUrl, signedIn);
  const response = redirectTo
    ? NextResponse.redirect(redirectTo)
    : NextResponse.next({ request: { headers: request.headers } });

  if (outcome.kind === "refreshed") {
    response.cookies.set(names.access, outcome.session.accessToken, accessCookieOptions(outcome.session.expiresIn));
    response.cookies.set(names.refresh, outcome.session.refreshToken, refreshCookieOptions());
  } else if (outcome.kind === "expired") {
    response.cookies.set(names.access, "", expiredCookieOptions(accessCookieOptions(0)));
    response.cookies.set(names.refresh, "", expiredCookieOptions(refreshCookieOptions()));
  }
  return response;
}
