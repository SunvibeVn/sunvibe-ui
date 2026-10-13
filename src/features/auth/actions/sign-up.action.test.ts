import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { readSignUpEntry, saveSignUpEntry } from "../session/cookies";
import { resendSignUpCodeAction, startSignUpAction, verifySignUpCodeAction } from "./sign-up.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({
  authService: { sendRegistrationCode: vi.fn(), verifyRegistrationCode: vi.fn() },
}));
vi.mock("../session/cookies", () => ({ readSignUpEntry: vi.fn(), saveSignUpEntry: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const send = vi.mocked(authService.sendRegistrationCode);
const verify = vi.mocked(authService.verifyRegistrationCode);
const readEntry = vi.mocked(readSignUpEntry);
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  readEntry.mockResolvedValue(undefined);
});

describe("startSignUpAction", () => {
  it("rejects a bad phone number without calling the backend", async () => {
    const state = await startSignUpAction(initialFormState, form({ username: "12345" }));
    expect(state.fieldErrors?.username).toEqual(["Enter a phone number of 10 to 12 digits."]);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the normalized number, keeps progress in the cookie and moves to the code step", async () => {
    send.mockResolvedValue({ channel: "PHONE", sentTo: "090****567", expiresAt: inMinutes(10), resendAvailableAt: inMinutes(1) });

    await expect(startSignUpAction(initialFormState, form({ username: "090 123 4567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up/verify",
    );

    expect(send).toHaveBeenCalledWith("0901234567", { headers: {} });
    expect(saveSignUpEntry).toHaveBeenCalledWith({ phone: "0901234567", resendAvailableAt: expect.any(String) });
  });

  it("shows a taken number under the phone field and keeps what was typed", async () => {
    send.mockRejectedValue(
      new ApiError(409, "Validation failed", { errors: [{ field: "username", message: "Phone number is already in use." }] }),
    );
    const state = await startSignUpAction(initialFormState, form({ username: "0901234567" }));
    expect(state.fieldErrors).toEqual({ username: ["Phone number is already in use."] });
    expect(state.values).toEqual({ username: "0901234567" });
    expect(saveSignUpEntry).not.toHaveBeenCalled();
  });

  it("tells how long to wait when the backend throttles the SMS", async () => {
    send.mockRejectedValue(new ApiError(429, "Please wait before requesting another code.", undefined, 45));
    const state = await startSignUpAction(initialFormState, form({ username: "0901234567" }));
    expect(state.message).toBe("Too many requests. Please wait 45 seconds and try again.");
  });

  it("does not send another SMS when the same number is still waiting for its code", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567", resendAvailableAt: inMinutes(1) });
    await expect(startSignUpAction(initialFormState, form({ username: "0901234567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up/verify",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("resumes at the details step when the number was already verified", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(10) });
    await expect(startSignUpAction(initialFormState, form({ username: "0901234567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up/details",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a fresh code for a different number", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567", resendAvailableAt: inMinutes(1) });
    send.mockResolvedValue({ channel: "PHONE", sentTo: "098****321", expiresAt: inMinutes(10), resendAvailableAt: inMinutes(1) });

    await expect(startSignUpAction(initialFormState, form({ username: "0987654321" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up/verify",
    );
    expect(send).toHaveBeenCalledWith("0987654321", { headers: {} });
  });
});

describe("resendSignUpCodeAction", () => {
  it("goes back to the first step when there is no sign-up in progress", async () => {
    await expect(resendSignUpCodeAction()).rejects.toThrow("NEXT_REDIRECT:/sign-up");
  });

  it("sends a new code to the number in the cookie and reports when to try again", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567" });
    const resendAvailableAt = inMinutes(1);
    send.mockResolvedValue({ channel: "PHONE", sentTo: "090****567", expiresAt: inMinutes(10), resendAvailableAt });

    const state = await resendSignUpCodeAction();

    expect(send).toHaveBeenCalledWith("0901234567", { headers: {} });
    expect(state).toEqual({ status: "success", message: "We sent you a new code.", resendAvailableAt });
    expect(saveSignUpEntry).toHaveBeenCalledWith({ phone: "0901234567", resendAvailableAt });
  });

  it("turns a throttled answer into a countdown", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567" });
    send.mockRejectedValue(new ApiError(429, "Please wait before requesting another code.", undefined, 30));

    const state = await resendSignUpCodeAction();

    expect(state.status).toBe("error");
    expect(Date.parse(state.resendAvailableAt ?? "") - Date.now()).toBeGreaterThan(25_000);
  });
});

describe("verifySignUpCodeAction", () => {
  it("rejects a code that is not six digits", async () => {
    const state = await verifySignUpCodeAction(initialFormState, form({ code: "12" }));
    expect(state.fieldErrors?.code).toEqual(["Enter the 6-digit code."]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("goes back to the first step when there is no sign-up in progress", async () => {
    await expect(verifySignUpCodeAction(initialFormState, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up",
    );
  });

  it("keeps the registration token in the cookie and moves to the details step", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567", resendAvailableAt: inMinutes(1) });
    const expiresAt = inMinutes(15);
    verify.mockResolvedValue({ registrationToken: "token-1", expiresAt });

    await expect(verifySignUpCodeAction(initialFormState, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-up/details",
    );

    expect(verify).toHaveBeenCalledWith("0901234567", "123456", { headers: {} });
    expect(saveSignUpEntry).toHaveBeenCalledWith({
      phone: "0901234567",
      registrationToken: "token-1",
      tokenExpiresAt: expiresAt,
    });
  });

  it("shows the backend's own wording for a wrong or burned code", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567" });
    verify.mockRejectedValue(new ApiError(400, "Incorrect verification code."));

    const state = await verifySignUpCodeAction(initialFormState, form({ code: "123456" }));

    expect(state).toEqual({ status: "error", message: "Incorrect verification code." });
    expect(saveSignUpEntry).not.toHaveBeenCalled();
  });

  it("falls back to the generic wording for other failures", async () => {
    readEntry.mockResolvedValue({ phone: "0901234567" });
    verify.mockRejectedValue(new ApiError(429, "Too many.", undefined, 120));

    const state = await verifySignUpCodeAction(initialFormState, form({ code: "123456" }));

    expect(state.message).toBe("Too many requests. Please wait 2 minutes and try again.");
  });
});
