import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { clearSignUpEntry, readSignUpEntry, saveSession, type SignUpEntry } from "../session/cookies";
import { registerAction } from "./register.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { register: vi.fn() } }));
vi.mock("../session/cookies", () => ({
  saveSession: vi.fn(),
  readSignUpEntry: vi.fn(),
  clearSignUpEntry: vi.fn(),
}));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const register = vi.mocked(authService.register);
const readEntry = vi.mocked(readSignUpEntry);
const verified: SignUpEntry = {
  phone: "0901234567",
  registrationToken: "token-1",
  tokenExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
};
const valid = { fullName: "Nguyen Van An", password: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  readEntry.mockResolvedValue(verified);
});

describe("registerAction", () => {
  it("sends a visitor who never started sign-up back to the first step", async () => {
    readEntry.mockResolvedValue(undefined);
    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/sign-up");
    expect(register).not.toHaveBeenCalled();
  });

  it("sends a visitor whose phone is not verified yet to the code step", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567" });
    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/sign-up/verify");
    expect(register).not.toHaveBeenCalled();
  });

  it("starts over when the registration token has expired", async () => {
    readEntry.mockResolvedValue({ ...verified, tokenExpiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/sign-up?expired=1");
    expect(register).not.toHaveBeenCalled();
  });

  it("never echoes passwords back", async () => {
    const state = await registerAction(initialFormState, form({ ...valid, confirmPassword: "Other@2026" }));
    expect(state.fieldErrors?.confirmPassword).toEqual(["Passwords do not match."]);
    expect(state.values).toEqual({ fullName: "Nguyen Van An" });
    expect(register).not.toHaveBeenCalled();
  });

  it("takes the phone number and token from the cookie, never from the form", async () => {
    const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: true };
    register.mockResolvedValue(session);

    await expect(
      registerAction(initialFormState, form({ ...valid, username: "0999999999", registrationToken: "forged" })),
    ).rejects.toThrow("NEXT_REDIRECT:/account?phone=verified");

    expect(register).toHaveBeenCalledWith(
      {
        fullName: "Nguyen Van An",
        username: "0901234567",
        email: "",
        idCardNumber: "",
        password: "Sunvibe@2026",
        confirmPassword: "Sunvibe@2026",
        registrationToken: "token-1",
      },
      { headers: {} },
    );
    expect(saveSession).toHaveBeenCalledWith(session);
    expect(clearSignUpEntry).toHaveBeenCalled();
  });

  it("falls back to phone verification if the backend did not mark the phone verified", async () => {
    register.mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: false });
    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/verify-phone");
  });

  it("starts over when auth-service refuses the registration token", async () => {
    register.mockRejectedValue(new ApiError(400, "Your phone verification is invalid or has expired."));

    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/sign-up?expired=1");
    expect(clearSignUpEntry).toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("tells in the alert when the phone number was taken in the meantime", async () => {
    register.mockRejectedValue(
      new ApiError(409, "Validation failed", { errors: [{ field: "username", message: "Phone number is already in use." }] }),
    );
    const state = await registerAction(initialFormState, form(valid));
    expect(state).toMatchObject({ status: "error", message: "Phone number is already in use." });
    expect(clearSignUpEntry).not.toHaveBeenCalled();
  });
});
