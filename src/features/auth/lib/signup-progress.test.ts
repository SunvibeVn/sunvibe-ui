import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_UP_STORAGE_KEY,
  clearSignUpProgress,
  isFuture,
  leaveSignUpStep,
  readSignUpProgress,
  readSignUpStep,
  signUpStepOf,
  signUpStepRedirect,
  writeSignUpProgress,
} from "./signup-progress";
import { memoryStorage } from "./test-support/memory-storage";

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe("isFuture", () => {
  it("is true only for a time still ahead", () => {
    expect(isFuture(new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(isFuture(new Date(Date.now() - 60_000).toISOString())).toBe(false);
  });

  it("is false when there is no time or it is not a date", () => {
    expect(isFuture(undefined)).toBe(false);
    expect(isFuture("not a date")).toBe(false);
  });
});

describe("sign-up progress in sessionStorage (C-7)", () => {
  it("progress_reloadInTheSameTab_isKept", () => {
    const storage = memoryStorage();
    const progress = { phone: "0901234567", resendAvailableAt: inMinutes(1) };
    writeSignUpProgress(storage, progress);

    // A reload keeps the tab's sessionStorage: a fresh read sees the same progress under `sv_signup`.
    expect(SIGN_UP_STORAGE_KEY).toBe("sv_signup");
    expect(JSON.parse(storage.getItem("sv_signup") ?? "null")).toEqual({ ...progress, startedAt: expect.any(Number) });
    expect(readSignUpProgress(storage)).toEqual(progress);
    expect(readSignUpStep(storage)).toEqual({ kind: "code", progress });
  });

  it("is at the details step while the registration token is valid", () => {
    const storage = memoryStorage();
    const progress = { phone: "0901234567", registrationToken: "token-1", tokenExpiresAt: inMinutes(10) };
    writeSignUpProgress(storage, progress);
    expect(readSignUpStep(storage)).toEqual({ kind: "details", progress });
  });

  it("progress_expiredToken_isCleared", () => {
    const storage = memoryStorage();
    writeSignUpProgress(storage, {
      phone: "0901234567",
      registrationToken: "token-1",
      tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(readSignUpStep(storage)).toEqual({ kind: "expired" });
    expect(storage.getItem("sv_signup")).toBeNull();
    expect(readSignUpProgress(storage)).toBeNull();
  });

  it("readSignUpProgress returns null for an expired token and clears it", () => {
    const storage = memoryStorage();
    writeSignUpProgress(storage, { phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(-1) });
    expect(readSignUpProgress(storage)).toBeNull();
    expect(storage.getItem("sv_signup")).toBeNull();
  });

  it("is no progress when nothing, broken JSON or a wrong shape is stored", () => {
    const storage = memoryStorage();
    expect(readSignUpStep(storage)).toEqual({ kind: "none" });
    storage.setItem("sv_signup", "{not json");
    expect(readSignUpStep(storage)).toEqual({ kind: "none" });
    storage.setItem("sv_signup", JSON.stringify({ phone: 42 }));
    expect(readSignUpStep(storage)).toEqual({ kind: "none" });
  });

  it("clears the progress", () => {
    const storage = memoryStorage();
    writeSignUpProgress(storage, { phone: "0901234567" });
    clearSignUpProgress(storage);
    expect(storage.getItem("sv_signup")).toBeNull();
  });

  it("treats blocked or missing storage as no progress and never throws", () => {
    const blocked = throwingStorage();
    expect(readSignUpStep(blocked)).toEqual({ kind: "none" });
    expect(readSignUpStep(null)).toEqual({ kind: "none" });
    expect(() => writeSignUpProgress(blocked, { phone: "0901234567" })).not.toThrow();
    expect(() => clearSignUpProgress(blocked)).not.toThrow();
    expect(() => writeSignUpProgress(null, { phone: "0901234567" })).not.toThrow();
  });
});

describe("sign-up progress lifetime (30 minutes, like the former sign-up cookie)", () => {
  const START = Date.parse("2026-10-18T10:00:00Z");
  const MINUTE = 60_000;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("phoneOnlyProgress_olderThan30Minutes_isClearedAndReadsAsNone", () => {
    vi.useFakeTimers({ now: START });
    const storage = memoryStorage();
    writeSignUpProgress(storage, { phone: "0901234567" }, { restart: true });
    vi.setSystemTime(START + 30 * MINUTE - 1);
    expect(readSignUpStep(storage)).toEqual({ kind: "code", progress: { phone: "0901234567" } });
    vi.setSystemTime(START + 30 * MINUTE);
    expect(readSignUpStep(storage)).toEqual({ kind: "none" });
    expect(storage.getItem(SIGN_UP_STORAGE_KEY)).toBeNull();
  });

  it("laterStepsOfTheSamePhone_keepTheStart", () => {
    vi.useFakeTimers({ now: START });
    const storage = memoryStorage();
    writeSignUpProgress(storage, { phone: "0901234567" }, { restart: true });
    vi.setSystemTime(START + 20 * MINUTE);
    // A resend, then the verified code: the progress still ends 30 minutes after the sign-up started.
    writeSignUpProgress(storage, { phone: "0901234567", resendAvailableAt: inMinutes(1) });
    writeSignUpProgress(storage, { phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(60) });
    vi.setSystemTime(START + 30 * MINUTE);
    expect(readSignUpProgress(storage)).toBeNull();
  });

  it("restartOrAnotherPhone_startsANewLifetime", () => {
    vi.useFakeTimers({ now: START });
    const storage = memoryStorage();
    writeSignUpProgress(storage, { phone: "0901234567" }, { restart: true });
    vi.setSystemTime(START + 20 * MINUTE);
    writeSignUpProgress(storage, { phone: "0901234567" }, { restart: true });
    vi.setSystemTime(START + 45 * MINUTE);
    expect(readSignUpProgress(storage)).toEqual({ phone: "0901234567" });

    writeSignUpProgress(storage, { phone: "0907654321" });
    vi.setSystemTime(START + 70 * MINUTE);
    expect(readSignUpProgress(storage)).toEqual({ phone: "0907654321" });
  });

  it("progressWithoutAStart_readsAsNone", () => {
    expect(signUpStepOf(JSON.stringify({ phone: "0901234567" }))).toEqual({ kind: "none" });
    expect(signUpStepOf(JSON.stringify({ phone: "0901234567", startedAt: "yesterday" }))).toEqual({ kind: "none" });
  });
});

describe("signUpStepOf and signUpStepRedirect (what a step page does with the progress)", () => {
  it("reads the stored text without touching storage", () => {
    expect(signUpStepOf(null)).toEqual({ kind: "none" });
    expect(signUpStepOf(JSON.stringify({ phone: "0901234567", startedAt: Date.now() }))).toEqual({
      kind: "code",
      progress: { phone: "0901234567" },
    });
    expect(
      signUpStepOf(
        JSON.stringify({
          phone: "0901234567",
          registrationToken: "t",
          tokenExpiresAt: inMinutes(-1),
          startedAt: Date.now(),
        }),
      ),
    ).toEqual({ kind: "expired" });
  });

  it("sends a visitor who skipped a step back to it", () => {
    const code = { kind: "code", progress: { phone: "0901234567" } } as const;
    const details = { kind: "details", progress: { phone: "0901234567", registrationToken: "t" } } as const;

    expect(signUpStepRedirect({ kind: "none" }, "code")).toBe("/sign-up");
    expect(signUpStepRedirect({ kind: "none" }, "details")).toBe("/sign-up");
    expect(signUpStepRedirect({ kind: "expired" }, "code")).toBe("/sign-up?expired=1");
    expect(signUpStepRedirect({ kind: "expired" }, "details")).toBe("/sign-up?expired=1");
    expect(signUpStepRedirect(code, "code")).toBeNull();
    expect(signUpStepRedirect(code, "details")).toBe("/sign-up/verify");
    expect(signUpStepRedirect(details, "code")).toBe("/sign-up/details");
    expect(signUpStepRedirect(details, "details")).toBeNull();
  });
});

describe("leaveSignUpStep (both step pages, /sign-up/verify and /sign-up/details)", () => {
  const expiredRaw = JSON.stringify({ phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(-1) });

  it.each(["code", "details"] as const)("leaveSignUpStep_expiredToken_clearsItAndStartsOver (%s page)", (page) => {
    const storage = memoryStorage();
    storage.setItem(SIGN_UP_STORAGE_KEY, expiredRaw);
    const replace = vi.fn();
    expect(leaveSignUpStep({ kind: "expired" }, page, { storage, replace })).toBe(true);
    expect(storage.getItem(SIGN_UP_STORAGE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/sign-up?expired=1");
  });

  it("leaveSignUpStep_skippedStep_goesThereAndKeepsTheProgress", () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ phone: "0901234567" });
    storage.setItem(SIGN_UP_STORAGE_KEY, raw);
    const replace = vi.fn();
    expect(leaveSignUpStep({ kind: "code", progress: { phone: "0901234567" } }, "details", { storage, replace })).toBe(
      true,
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith("/sign-up/verify");
    expect(storage.getItem(SIGN_UP_STORAGE_KEY)).toBe(raw);
  });

  it("leaveSignUpStep_pageFits_staysAndTouchesNothing", () => {
    const storage = memoryStorage();
    const replace = vi.fn();
    expect(leaveSignUpStep({ kind: "code", progress: { phone: "0901234567" } }, "code", { storage, replace })).toBe(
      false,
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
