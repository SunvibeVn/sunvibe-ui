import { describe, expect, it, vi } from "vitest";
import { leaveAfterReset, moveResetTokenFromUrl } from "./password-reset-browser";
import { RESET_STORAGE_KEY, readResetProgress } from "./reset-progress";
import { memoryStorage } from "./test-support/memory-storage";

describe("moveResetTokenFromUrl (auth-email-access spec 6.2, U-6)", () => {
  const at = (href: string) => ({ href, replace: vi.fn() });

  it("reset_readsFragment_clearsIt", () => {
    const storage = memoryStorage();
    const location = at("https://sunvibe.test/reset-password#token=reset-1");
    moveResetTokenFromUrl({ location, storage });
    // A new document: the router of this one keeps the first URL, fragment included (e2e/reset-link-address.spec.ts).
    expect(location.replace).toHaveBeenCalledExactlyOnceWith("/reset-password");
    expect(readResetProgress(storage)?.token).toBe("reset-1");
  });

  it("reset_routerRefresh_doesNotRestoreToken", () => {
    const storage = memoryStorage();
    moveResetTokenFromUrl({ location: at("https://sunvibe.test/reset-password#token=reset-1"), storage });

    // The new document has nothing to move: a token cleared since then is not stored again.
    storage.removeItem(RESET_STORAGE_KEY);
    const reloaded = at("https://sunvibe.test/reset-password");
    moveResetTokenFromUrl({ location: reloaded, storage });

    expect(reloaded.replace).not.toHaveBeenCalled();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("reset_queryToken_ignored", () => {
    const storage = memoryStorage();
    const location = at("https://sunvibe.test/reset-password?token=reset-1");
    moveResetTokenFromUrl({ location, storage });
    expect(location.replace).not.toHaveBeenCalled();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("moveResetToken_noToken_doesNothing", () => {
    const storage = memoryStorage();
    const location = at("https://sunvibe.test/reset-password?via=email");
    moveResetTokenFromUrl({ location, storage });
    expect(location.replace).not.toHaveBeenCalled();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });
});

describe("leaveAfterReset (auth-browser-session §4.7)", () => {
  it("leaveAfterReset_success_leavesWithAFullLoad", () => {
    const location = { replace: vi.fn() };
    expect(leaveAfterReset({ redirect: "/login?reset=success" }, location)).toEqual({ status: "success" });
    // A replace navigation with a full load: the form (and the new password in its state) does not survive in a
    // route Next keeps mounted.
    expect(location.replace).toHaveBeenCalledExactlyOnceWith("/login?reset=success");
  });

  it("leaveAfterReset_formState_staysOnThePage", () => {
    const location = { replace: vi.fn() };
    const state = { status: "error", message: "The code is incorrect or has expired." } as const;
    expect(leaveAfterReset(state, location)).toBe(state);
    expect(location.replace).not.toHaveBeenCalled();
  });
});
