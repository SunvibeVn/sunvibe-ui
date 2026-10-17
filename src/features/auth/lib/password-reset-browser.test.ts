import { describe, expect, it, vi } from "vitest";
import { leaveAfterReset, moveResetTokenFromUrl } from "./password-reset-browser";
import { RESET_STORAGE_KEY, readResetProgress } from "./reset-progress";
import { memoryStorage } from "./test-support/memory-storage";

describe("moveResetTokenFromUrl (auth-browser-session S-19, W10-39)", () => {
  it("moveResetToken_tokenInTheAddress_storesItAndReplacesTheAddressOnce", () => {
    const storage = memoryStorage();
    const router = { replace: vi.fn() };
    const location = { href: "https://sunvibe.test/reset-password?token=reset-1&via=email#x" };
    moveResetTokenFromUrl({ router, location, storage });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/reset-password?via=email#x", { scroll: false });
    expect(readResetProgress(storage)?.token).toBe("reset-1");
  });

  it("moveResetToken_noToken_doesNothing", () => {
    const storage = memoryStorage();
    const router = { replace: vi.fn() };
    moveResetTokenFromUrl({ router, location: { href: "https://sunvibe.test/reset-password?via=email" }, storage });
    expect(router.replace).not.toHaveBeenCalled();
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
