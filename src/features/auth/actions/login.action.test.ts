import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import { loginAction } from "./login.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { login: vi.fn() } }));
vi.mock("../session/cookies", () => ({ saveSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({ "User-Agent": "UA" })) }));

const login = vi.mocked(authService.login);

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("loginAction", () => {
  it("returns field errors without calling the backend", async () => {
    const state = await loginAction(initialFormState, form({ username: "12", password: "" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.username).toBeDefined();
    expect(state.fieldErrors?.password).toBeDefined();
    expect(state.values).toEqual({ username: "12" });
    expect(login).not.toHaveBeenCalled();
  });

  it("saves the session and goes to `next` when the phone is verified", async () => {
    const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: true };
    login.mockResolvedValue(session);

    await expect(
      loginAction(initialFormState, form({ username: "0901234567", password: "pw", next: "/account?tab=1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/account?tab=1");

    expect(login).toHaveBeenCalledWith({ username: "0901234567", password: "pw" }, { headers: { "User-Agent": "UA" } });
    expect(saveSession).toHaveBeenCalledWith(session);
  });

  it("goes to phone verification when the phone isn't verified, ignoring unsafe `next`", async () => {
    login.mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: false });
    await expect(
      loginAction(initialFormState, form({ username: "0901234567", password: "pw", next: "//evil.com" })),
    ).rejects.toThrow("NEXT_REDIRECT:/verify-phone");
  });

  it("falls back to the account page when a verified user's `next` is unsafe", async () => {
    login.mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: true });
    await expect(
      loginAction(initialFormState, form({ username: "0901234567", password: "pw", next: "/.//evil.com" })),
    ).rejects.toThrow("NEXT_REDIRECT:/account");
  });

  it("shows a clear message for wrong credentials and keeps the phone number", async () => {
    login.mockRejectedValue(new ApiError(401, "Bad credentials"));
    const state = await loginAction(initialFormState, form({ username: "0901234567", password: "wrong" }));
    expect(state).toEqual({
      status: "error",
      message: "Phone number or password is incorrect.",
      values: { username: "0901234567" },
    });
    expect(saveSession).not.toHaveBeenCalled();
  });
});
