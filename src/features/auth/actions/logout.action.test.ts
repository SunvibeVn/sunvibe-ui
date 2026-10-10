import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "../services/auth.service";
import { clearSession, readSessionTokens } from "../session/cookies";
import { logoutAction } from "./logout.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { logout: vi.fn() } }));
vi.mock("../session/cookies", () => ({ readSessionTokens: vi.fn(), clearSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

beforeEach(() => vi.clearAllMocks());

describe("logoutAction", () => {
  it("revokes the refresh token, clears cookies and goes home", async () => {
    vi.mocked(readSessionTokens).mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(authService.logout).toHaveBeenCalledWith("r", { headers: {} });
    expect(clearSession).toHaveBeenCalled();
  });

  it("still signs out locally when the backend is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(readSessionTokens).mockResolvedValue({ refreshToken: "r" });
    vi.mocked(authService.logout).mockRejectedValue(new TypeError("fetch failed"));
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(clearSession).toHaveBeenCalled();
  });
});
