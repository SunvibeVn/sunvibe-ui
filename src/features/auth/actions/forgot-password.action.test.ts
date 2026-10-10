import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { readResetEntry, saveResetToken } from "../session/cookies";
import { forgotPasswordByEmailAction, forgotPasswordBySmsAction } from "./forgot-password.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({
  authService: { forgotPasswordByEmail: vi.fn(), forgotPasswordBySms: vi.fn() },
}));
vi.mock("../session/cookies", () => ({ saveResetToken: vi.fn(), readResetEntry: vi.fn(async () => undefined) }));
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
    expect(saveResetToken).toHaveBeenCalledWith("reset-1", "0901234567");
  });

  it("keeps the real token when the same phone asks again within the backend's cooldown", async () => {
    // Inside the cooldown auth-service answers with a decoy token and sends no SMS.
    vi.mocked(readResetEntry).mockResolvedValue({ token: "real", phone: "0901234567", issuedAt: Date.now() - 10_000 });
    vi.mocked(authService.forgotPasswordBySms).mockResolvedValue({
      message: "ok",
      resetToken: "decoy",
      otpExpirationMinutes: 5,
    });
    await expect(forgotPasswordBySmsAction(initialFormState, form({ phoneNumber: "090 123 4567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?via=sms",
    );
    expect(saveResetToken).not.toHaveBeenCalled();
  });

  it("replaces the token after the cooldown or for another phone", async () => {
    vi.mocked(authService.forgotPasswordBySms).mockResolvedValue({ message: "ok", resetToken: "new", otpExpirationMinutes: 5 });

    vi.mocked(readResetEntry).mockResolvedValue({ token: "old", phone: "0901234567", issuedAt: Date.now() - 61_000 });
    await expect(forgotPasswordBySmsAction(initialFormState, form({ phoneNumber: "0901234567" }))).rejects.toThrow();
    vi.mocked(readResetEntry).mockResolvedValue({ token: "old", phone: "0907654321", issuedAt: Date.now() });
    await expect(forgotPasswordBySmsAction(initialFormState, form({ phoneNumber: "0901234567" }))).rejects.toThrow();

    expect(saveResetToken).toHaveBeenCalledTimes(2);
  });
});
