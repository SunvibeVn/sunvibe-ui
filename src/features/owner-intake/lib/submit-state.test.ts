import { describe, expect, it } from "vitest";

import { canSubmit, INITIAL_SUBMIT_STATE, submitStateAfter, type SubmitGuard } from "./submit-state";
import type { SubmitOutcome } from "./submit-outcome";

const NOW = 1_760_000_000_000;

describe("submitStateAfter", () => {
  it("starts with the empty form and no message", () => {
    expect(INITIAL_SUBMIT_STATE).toEqual({ status: "editing" });
  });

  it("shows the success screen (new request or replay) with the code", () => {
    expect(submitStateAfter({ kind: "success", requestCode: "SV-7K3M-Q9TX", key: "reset" }, NOW)).toEqual({
      status: "sent",
      requestCode: "SV-7K3M-Q9TX",
    });
  });

  it("keeps the form with the error and no wait", () => {
    const outcome: SubmitOutcome = {
      kind: "error",
      fieldErrors: {},
      message: "errors.generic",
      retryable: true,
      key: "keep",
      supportCode: "01JB7Q0Z3E6K9M2N4P5R8S1T0V",
    };
    expect(submitStateAfter(outcome, NOW)).toEqual({ status: "editing", outcome });
  });

  it("starts the Retry-After wait now on a 429", () => {
    const outcome: SubmitOutcome = {
      kind: "error",
      fieldErrors: {},
      message: "errors.rateLimited",
      retryable: false,
      key: "keep",
      retryAfterSeconds: 120,
    };
    expect(submitStateAfter(outcome, NOW)).toEqual({
      status: "editing",
      outcome,
      wait: { startedAt: NOW, seconds: 120 },
    });
  });

  it("starts no wait on a 429 without Retry-After", () => {
    const outcome: SubmitOutcome = {
      kind: "error",
      fieldErrors: {},
      message: "errors.rateLimited",
      retryable: false,
      key: "keep",
      retryAfterSeconds: 0,
    };
    expect(submitStateAfter(outcome, NOW)).toEqual({ status: "editing", outcome });
  });
});

describe("canSubmit", () => {
  const READY: SubmitGuard = { inFlight: false, catalogReady: true, waitLeft: 0, locating: false };

  it("allows a submit when nothing blocks it", () => {
    expect(canSubmit(READY)).toBe(true);
  });

  it("blocks a second submit while one is in flight", () => {
    expect(canSubmit({ ...READY, inFlight: true })).toBe(false);
  });

  it("blocks until a ward can be chosen", () => {
    expect(canSubmit({ ...READY, catalogReady: false })).toBe(false);
  });

  it("blocks during the 429 wait", () => {
    expect(canSubmit({ ...READY, waitLeft: 3 })).toBe(false);
  });

  it("blocks while the current location is being read, so a late pin never races the body", () => {
    expect(canSubmit({ ...READY, locating: true })).toBe(false);
  });
});
