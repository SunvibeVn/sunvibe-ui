import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import { registerAction } from "./register.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { register: vi.fn() } }));
vi.mock("../session/cookies", () => ({ saveSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const register = vi.mocked(authService.register);
const valid = {
  fullName: "Nguyen Van An",
  username: "090 123 4567",
  email: "",
  idCardNumber: "",
  password: "Sunvibe@2026",
  confirmPassword: "Sunvibe@2026",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("registerAction", () => {
  it("never echoes passwords back", async () => {
    const state = await registerAction(initialFormState, form({ ...valid, confirmPassword: "Other@2026" }));
    expect(state.fieldErrors?.confirmPassword).toEqual(["Passwords do not match."]);
    expect(state.values).toEqual({ fullName: "Nguyen Van An", username: "090 123 4567", email: "", idCardNumber: "" });
  });

  it("sends normalized data, saves the session and goes to phone verification", async () => {
    const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: false };
    register.mockResolvedValue(session);

    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/verify-phone");
    expect(register).toHaveBeenCalledWith({ ...valid, username: "0901234567" }, { headers: {} });
    expect(saveSession).toHaveBeenCalledWith(session);
  });

  it("shows the backend's duplicate-phone error on the phone field", async () => {
    register.mockRejectedValue(
      new ApiError(409, "Validation failed", { errors: [{ field: "username", message: "Phone number already in use." }] }),
    );
    const state = await registerAction(initialFormState, form(valid));
    expect(state.fieldErrors).toEqual({ username: ["Phone number already in use."] });
  });
});
