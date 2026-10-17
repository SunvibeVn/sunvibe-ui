import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { formStateFromResult, readForm, validationError } from "./form-state";

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

describe("formStateFromResult", () => {
  it("formStateFromResult_fieldErrors_mapToFields", () => {
    const state = formStateFromResult(
      {
        ok: false,
        kind: "http",
        status: 400,
        code: "VALIDATION_FAILED",
        fieldErrors: [
          { field: "username", message: "Phone number already registered." },
          { field: "username", message: "Second." },
          { field: "email", message: "E-mail already in use." },
        ],
      },
      { values: { username: "0901234567" }, screen: "generic" },
    );
    expect(state).toEqual({
      status: "error",
      fieldErrors: { username: ["Phone number already registered.", "Second."], email: ["E-mail already in use."] },
      values: { username: "0901234567" },
    });
  });

  it("formStateFromResult_noFieldErrors_usesTheScreenText", () => {
    expect(
      formStateFromResult(
        { ok: false, kind: "http", status: 401, code: "INVALID_CREDENTIALS", fieldErrors: [] },
        { values: { username: "0901234567" }, screen: "login" },
      ),
    ).toEqual({ status: "error", message: "Phone number or password is incorrect.", values: { username: "0901234567" } });
  });

  it("formStateFromResult_network_genericAndNoLog", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(formStateFromResult({ ok: false, kind: "network" }, { screen: "login" })).toEqual({
      status: "error",
      message: "We couldn't reach the server. Please try again.",
      values: undefined,
    });
    expect(log).not.toHaveBeenCalled();
  });
});
