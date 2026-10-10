import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveResetToken } from "../session/cookies";
import { forgotPasswordByEmailAction, forgotPasswordBySmsAction } from "./forgot-password.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({
  authService: { forgotPasswordByEmail: vi.fn(), forgotPasswordBySms: vi.fn() },
}));
vi.mock("../session/cookies", () => ({ saveResetToken: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("forgotPasswordByEmailAction", () => {
  it("answers the same way whether or not the account exists", async () => {
    vi.mocked(authService.forgotPasswordByEmail).mockResolvedValue({ message: "ok", otpExpirationMinutes: 5 });
    const state = await forgotPasswordByEmailAction(initialFormState, form({ email: "an@sunvibe.vn" }));
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/^If an account uses this email/);
  });
});

describe("forgotPasswordBySmsAction", () => {
  it("keeps the reset token in a cookie and moves to the reset page", async () => {
    vi.mocked(authService.forgotPasswordBySms).mockResolvedValue({
      message: "ok",
      resetToken: "reset-1",
      otpExpirationMinutes: 5,
    });
    await expect(forgotPasswordBySmsAction(initialFormState, form({ phoneNumber: "0901234567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?via=sms",
    );
    expect(saveResetToken).toHaveBeenCalledWith("reset-1");
  });
});
