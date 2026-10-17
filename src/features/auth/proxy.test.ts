import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authProxy } from "./proxy";
import { hintCookieName, LEGACY_FE_COOKIES } from "./session/browser-cookies";

// Vitest runs with NODE_ENV=test, so the hint is the unprefixed development name.
const HINT = hintCookieName();

function request(path: string, cookie = "") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: { cookie } });
}

function location(response: Response): URL | null {
  const value = response.headers.get("location");
  return value ? new URL(value) : null;
}

function setCookieHeaders(response: Response): string[] {
  return response.headers.getSetCookie();
}

function setCookieFor(response: Response, name: string): string | undefined {
  return setCookieHeaders(response).find((header) => header.startsWith(`${name}=`));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("authProxy", () => {
  it("proxy_protectedPathWithoutHint_redirectsToLoginWithNext (W10-41)", () => {
    const response = authProxy(request("/account?tab=profile"));

    const target = location(response);
    expect(target?.pathname).toBe("/login");
    expect(target?.searchParams.get("next")).toBe("/account?tab=profile");
  });

  it("proxy_protectedPathWithEmptyHint_redirectsToLogin", () => {
    const response = authProxy(request("/verify-phone", `${HINT}=`));
    expect(location(response)?.pathname).toBe("/login");
  });

  it("proxy_protectedPathWithHint_passes", () => {
    const response = authProxy(request("/account", `${HINT}=abc123`));
    expect(location(response)).toBeNull();
  });

  it("proxy_guestPathWithHint_redirectsToAccount (W10-41)", () => {
    const response = authProxy(request("/login", `${HINT}=abc123`));
    expect(location(response)?.pathname).toBe("/account");
  });

  it("proxy_guestPathWithHintAndSessionParam_passes (W10-41)", () => {
    const response = authProxy(request("/login?session=expired", `${HINT}=abc123`));
    expect(location(response)).toBeNull();
  });

  it("proxy_oldSessionCookiesAlone_doNotCountAsSignedIn (W10-42)", () => {
    const response = authProxy(request("/account", "sv_at=a1; sv_rt=r1"));
    expect(location(response)?.pathname).toBe("/login");
  });

  it("proxy_legacyCookiesPresent_areExpired (W10-42)", () => {
    const cookie = `sv_at=a1; sv_rt=r1; sv_signup=s; sv_reset=t; ${HINT}=abc123; sv_logout_pending=1; theme=dark`;
    for (const response of [authProxy(request("/", cookie)), authProxy(request("/login", cookie))]) {
      for (const name of ["sv_at", "sv_rt", "sv_signup", "sv_reset"]) {
        const header = setCookieFor(response, name);
        expect(header, name).toBeDefined();
        expect(header).toMatch(new RegExp(`^${name}=;`));
        expect(header).toMatch(/Path=\//);
        expect(header).toMatch(/Max-Age=0/);
        // Only `__Host-` names need `Secure`; unprefixed names are expired without it.
        expect(header).not.toMatch(/Secure/i);
      }
      // Only the legacy names are touched: never the hint, the pending flag or anything else.
      expect(setCookieHeaders(response)).toHaveLength(4);
      expect(response.cookies.get(HINT)).toBeUndefined();
      expect(response.cookies.get("sv_logout_pending")).toBeUndefined();
      expect(response.cookies.get("theme")).toBeUndefined();
    }
  });

  it("proxy_legacyHostCookies_expiredWithSecure (W10-42)", () => {
    const response = authProxy(request("/account", "__Host-sv_at=a1; __Host-sv_rt=r1"));
    for (const name of ["__Host-sv_at", "__Host-sv_rt"]) {
      const header = setCookieFor(response, name) ?? "";
      expect(header).toMatch(new RegExp(`^${name}=;`));
      expect(header).toMatch(/Path=\//);
      expect(header).toMatch(/Max-Age=0/);
      expect(header).toMatch(/Secure/);
    }
  });

  it("proxy_noLegacyCookies_setsNoCookie", () => {
    const response = authProxy(request("/account", `${HINT}=abc123; sv_refresh=x`));
    expect(setCookieHeaders(response)).toEqual([]);
    expect(LEGACY_FE_COOKIES).not.toContain("sv_refresh");
  });

  it("proxy_hintCookieNamePerBuild (W10-41)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodHint = hintCookieName();
    expect(prodHint).toBe("__Host-sv_signed_in");

    expect(location(authProxy(request("/account", `${prodHint}=abc123`)))).toBeNull();
    expect(location(authProxy(request("/account", "sv_signed_in=abc123")))?.pathname).toBe("/login");
  });

  it("proxy_neverCallsTheApi (W10-20)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cookie = `${HINT}=abc123; sv_at=a1; sv_rt=r1`;

    authProxy(request("/account", cookie));
    authProxy(request("/login", cookie));
    authProxy(request("/account"));
    authProxy(request("/verify-phone", "sv_rt=r1"));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
