import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { formStateFromError, readForm, validationError } from "./form-state";

afterEach(() => vi.restoreAllMocks());

describe("readForm", () => {
  it("reads named fields as strings, empty when missing", () => {
    const data = new FormData();
    data.set("username", "0901234567");
    expect(readForm(data, ["username", "password"])).toEqual({ username: "0901234567", password: "" });
  });
});

describe("validationError", () => {
  it("returns zod field errors and the values to refill", () => {
    const result = z.object({ email: z.email("Bad email") }).safeParse({ email: "x" });
    if (result.success) throw new Error("expected failure");
    expect(validationError(result.error, { email: "x" })).toEqual({
      status: "error",
      fieldErrors: { email: ["Bad email"] },
      values: { email: "x" },
    });
  });
});

describe("formStateFromError", () => {
  it("maps backend field errors onto fields", () => {
    const error = new ApiError(409, "Validation failed", {
      errors: [{ field: "username", message: "Phone number already registered." }],
    });
    expect(formStateFromError(error)).toEqual({
      status: "error",
      fieldErrors: { username: ["Phone number already registered."] },
      values: undefined,
    });
  });

  it("uses a per-status override first", () => {
    const error = new ApiError(401, "Bad credentials");
    expect(formStateFromError(error, { overrides: { 401: "Phone number or password is incorrect." } }).message).toBe(
      "Phone number or password is incorrect.",
    );
  });

  it("explains lockouts and rate limits with the wait time", () => {
    expect(formStateFromError(new ApiError(423, "Locked", undefined, 300)).message).toBe(
      "Too many failed attempts. Try again in 5 minutes.",
    );
    expect(formStateFromError(new ApiError(429, "Slow down", undefined, 45)).message).toBe(
      "Too many requests. Please wait 45 seconds and try again.",
    );
  });

  it("says the code is wrong or expired on 400", () => {
    expect(formStateFromError(new ApiError(400, "Invalid OTP")).message).toBe("The code is incorrect or has expired.");
  });

  it("hides server errors and network failures behind a generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const generic = "We couldn't reach the server. Please try again.";
    expect(formStateFromError(new ApiError(500, "NullPointerException")).message).toBe(generic);
    expect(formStateFromError(new TypeError("fetch failed")).message).toBe(generic);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("keeps the submitted values", () => {
    expect(formStateFromError(new ApiError(400, "x"), { values: { username: "0901234567" } }).values).toEqual({
      username: "0901234567",
    });
  });
});
