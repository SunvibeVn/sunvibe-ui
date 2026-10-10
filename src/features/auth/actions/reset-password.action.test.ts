import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { clearResetToken, clearSession, readResetToken } from "../session/cookies";
import { resetPasswordAction } from "./reset-password.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { resetPassword: vi.fn() } }));
vi.mock("../session/cookies", () => ({
  readResetToken: vi.fn(),
  clearResetToken: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const fields = { otpCode: "123456", newPassword: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readResetToken).mockResolvedValue(undefined);
});

describe("resetPasswordAction", () => {
  it("refuses when there is no token in the form or cookie", async () => {
    const state = await resetPasswordAction(initialFormState, form(fields));
    expect(state.message).toBe("This reset link is invalid or has expired. Request a new one.");
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it("uses the SMS token from the cookie, signs out and goes to login", async () => {
    vi.mocked(readResetToken).mockResolvedValue("reset-sms");
    await expect(resetPasswordAction(initialFormState, form(fields))).rejects.toThrow(
      "NEXT_REDIRECT:/login?reset=success",
    );
    expect(authService.resetPassword).toHaveBeenCalledWith({ ...fields, resetToken: "reset-sms" }, { headers: {} });
    expect(clearResetToken).toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
  });

  it("prefers the e-mail link token from the form", async () => {
    vi.mocked(readResetToken).mockResolvedValue("reset-sms");
    await expect(resetPasswordAction(initialFormState, form({ ...fields, resetToken: "reset-mail" }))).rejects.toThrow();
    expect(authService.resetPassword).toHaveBeenCalledWith({ ...fields, resetToken: "reset-mail" }, { headers: {} });
  });

  it("explains a wrong code", async () => {
    vi.mocked(authService.resetPassword).mockRejectedValue(new ApiError(400, "Invalid OTP"));
    const state = await resetPasswordAction(initialFormState, form({ ...fields, resetToken: "t" }));
    expect(state.message).toBe("The code is incorrect or has expired.");
    expect(clearSession).not.toHaveBeenCalled();
  });
});
