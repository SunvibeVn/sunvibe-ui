import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service";

const tokenBody = {
  code: 200,
  result: {
    tokenType: "Bearer",
    accessToken: "access-1",
    expiresIn: 900,
    username: "0901234567",
    userEmail: null,
    roles: ["ROLE_CLIENT"],
    phoneVerified: false,
    emailVerified: false,
    message: "ok",
  },
};

function respond(body: unknown, setCookies: string[] = [], status = 200) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.stubEnv("API_BASE_URL", "http://api.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("authService.login", () => {
  it("returns the access token from the body and the refresh token from Set-Cookie", async () => {
    const fetchMock = respond(tokenBody, ["cookie-jwt=access-1; Path=/", "cookie-jwt-rf=refresh-1; Path=/api/auth"]);

    const session = await authService.login(
      { username: "0901234567", password: "pw" },
      { headers: { "X-Forwarded-For": "203.0.113.7" } },
    );

    expect(session).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, phoneVerified: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://api.test/api/auth/login");
    expect(new Headers(init.headers).get("x-forwarded-for")).toBe("203.0.113.7");
    expect(init.cache).toBe("no-store");
  });

  it("fails loudly when the refresh cookie is missing", async () => {
    respond(tokenBody, ["cookie-jwt=access-1; Path=/"]);
    await expect(authService.login({ username: "0901234567", password: "pw" })).rejects.toThrow(/refresh/);
  });
});

describe("authService authenticated calls", () => {
  it("unwraps the profile and sends the bearer token", async () => {
    const fetchMock = respond({ code: 200, result: { fullName: "An", username: "0901234567" } });
    const profile = await authService.getProfile("access-1");
    expect(profile.fullName).toBe("An");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://api.test/api/user/query/my-info");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-1");
  });

  it("sends the refresh token as the backend cookie on logout", async () => {
    const fetchMock = respond({ code: 200, message: "bye" });
    await authService.logout("refresh-1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get("cookie")).toBe("cookie-jwt-rf=refresh-1");
  });
});
