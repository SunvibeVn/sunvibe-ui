import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "../session/cookies";
import { confirmPhoneAction, sendPhoneCodeAction } from "./verify-phone.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { sendPhoneCode: vi.fn(), confirmPhone: vi.fn() } }));
vi.mock("../session/cookies", () => ({ readSessionTokens: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const tokens = vi.mocked(readSessionTokens);
const send = vi.mocked(authService.sendPhoneCode);
const confirm = vi.mocked(authService.confirmPhone);

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  tokens.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
});

describe("sendPhoneCodeAction", () => {
  it("reports where the code went and when it can be resent", async () => {
    send.mockResolvedValue({
      channel: "PHONE",
      sentTo: "*******567",
      expiresAt: "2026-10-10T10:05:00Z",
      resendAvailableAt: "2026-10-10T10:01:00Z",
    });
    const state = await sendPhoneCodeAction();
    expect(state).toEqual({
      status: "success",
      message: "We sent a 6-digit code to *******567.",
      resendAvailableAt: "2026-10-10T10:01:00Z",
    });
    expect(send).toHaveBeenCalledWith({ accessToken: "a", headers: {} });
  });

  it("starts the countdown from Retry-After when rate limited", async () => {
    send.mockRejectedValue(new ApiError(429, "Too many", undefined, 60));
    const state = await sendPhoneCodeAction();
    expect(state.status).toBe("error");
    expect(Date.parse(state.resendAvailableAt ?? "")).toBeGreaterThan(Date.now() + 50_000);
  });

  it("sends an expired session back to login", async () => {
    send.mockRejectedValue(new ApiError(401, "Unauthorized"));
    await expect(sendPhoneCodeAction()).rejects.toThrow(
      "NEXT_REDIRECT:/login?session=expired&next=%2Fverify-phone",
    );
  });
});

describe("confirmPhoneAction", () => {
  it("rejects a malformed code without calling the backend", async () => {
    const state = await confirmPhoneAction(initialFormState, form({ code: "12" }));
    expect(state.fieldErrors?.code).toEqual(["Enter the 6-digit code."]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms and goes to the account page", async () => {
    await expect(confirmPhoneAction(initialFormState, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/account?phone=verified",
    );
    expect(confirm).toHaveBeenCalledWith("123456", { accessToken: "a", headers: {} });
  });

  it("explains a wrong or expired code", async () => {
    confirm.mockRejectedValue(new ApiError(400, "Invalid code"));
    const state = await confirmPhoneAction(initialFormState, form({ code: "123456" }));
    expect(state.message).toBe("The code is incorrect or has expired.");
  });
});
