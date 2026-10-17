import { NextResponse, type NextRequest } from "next/server";
import { hintCookieName, LEGACY_FE_COOKIES } from "./session/browser-cookies";
import { guardRedirect } from "./session/route-guard";

// Public entry point for src/proxy.ts. Keep it free of React and next/headers.

/**
 * Optimistic redirects from the sign-in hint cookie only (auth-browser-session §4.8): no refresh, no token cookie,
 * no API call; Next holds no session (auth-browser-session BR-1). The hint never authorizes anything
 * (auth-browser-session BR-8: it only steers redirects; the API decides every access).
 * Also expires the cookies of the old server-side session when a request still carries them
 * (auth-browser-session BR-5: Next sets no session cookie).
 */
export function authProxy(request: NextRequest): NextResponse {
  const signedIn = Boolean(request.cookies.get(hintCookieName())?.value);

  const redirectTo = guardRedirect(request.nextUrl, signedIn);
  const response = redirectTo ? NextResponse.redirect(redirectTo) : NextResponse.next();

  for (const name of LEGACY_FE_COOKIES) {
    if (!request.cookies.has(name)) continue;
    // The `__Host-` prefix requires `Secure` and `Path=/`, or the browser ignores the expiry.
    response.cookies.set(name, "", { path: "/", maxAge: 0, ...(name.startsWith("__Host-") && { secure: true }) });
  }
  return response;
}
