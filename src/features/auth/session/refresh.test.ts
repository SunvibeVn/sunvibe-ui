import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { refreshIfNeeded } from "./refresh";

const session = { accessToken: "a2", refreshToken: "r2", expiresIn: 900, phoneVerified: true };

afterEach(() => vi.restoreAllMocks());

describe("refreshIfNeeded", () => {
  it("does nothing while the access token is still there or without a refresh token", async () => {
    const refresh = vi.fn();
    expect(await refreshIfNeeded({ access: "a1", refresh: "r1" }, {}, refresh)).toEqual({ kind: "none" });
    expect(await refreshIfNeeded({}, {}, refresh)).toEqual({ kind: "none" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when only the refresh token is left", async () => {
    const refresh = vi.fn(async () => session);
    const outcome = await refreshIfNeeded({ refresh: "r1" }, { "User-Agent": "UA" }, refresh);
    expect(outcome).toEqual({ kind: "refreshed", session });
    expect(refresh).toHaveBeenCalledWith("r1", { "User-Agent": "UA" });
  });

  it("ends the session when the backend rejects the refresh token", async () => {
    const refresh = vi.fn(async () => {
      throw new ApiError(401, "Invalid refresh token");
    });
    expect(await refreshIfNeeded({ refresh: "r1" }, {}, refresh)).toEqual({ kind: "expired" });
  });

  it("keeps the session when the backend is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refresh = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await refreshIfNeeded({ refresh: "r1" }, {}, refresh)).toEqual({ kind: "unavailable" });
  });
});
