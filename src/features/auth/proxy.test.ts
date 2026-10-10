import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { authProxy } from "./proxy";

const session = { accessToken: "a2", refreshToken: "r2", expiresIn: 900, phoneVerified: true };

function request(path: string, cookie = "", method = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: { cookie } });
}

describe("authProxy", () => {
  it("refreshes an expired access token and sets both cookies on the response", async () => {
    const refresh = vi.fn(async () => session);
    const response = await authProxy(request("/account", "sv_rt=r1"), refresh);

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sv_at")?.value).toBe("a2");
    expect(response.cookies.get("sv_rt")?.value).toBe("r2");
  });

  it("refreshes before a Server Action POST runs", async () => {
    const refresh = vi.fn(async () => session);
    const response = await authProxy(request("/verify-phone", "sv_rt=r1", "POST"), refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(response.cookies.get("sv_at")?.value).toBe("a2");
  });

  it("clears cookies and redirects to login when the refresh token is rejected", async () => {
    const refresh = vi.fn(async () => {
      throw new ApiError(401, "expired");
    });
    const response = await authProxy(request("/account", "sv_rt=r1"), refresh);

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
    expect(response.cookies.get("sv_rt")?.value).toBe("");
  });

  it("redirects a signed-out visitor away from a protected page without calling the backend", async () => {
    const refresh = vi.fn();
    const response = await authProxy(request("/account"), refresh);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
    expect(refresh).not.toHaveBeenCalled();
  });
});
