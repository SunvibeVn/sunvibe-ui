import { describe, expect, it } from "vitest";
import {
  RESET_STORAGE_KEY,
  clearResetProgress,
  hasResetToken,
  readResetProgress,
  resetSectionView,
  saveResetToken,
  takeTokenFromUrl,
} from "./reset-progress";
import { memoryStorage } from "./test-support/memory-storage";

function blockedStorage(): Storage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

const NOW = 1_800_000_000_000;

describe("reset progress (sessionStorage sv_reset, W10-39)", () => {
  it("stores the token, phone and issue time under sv_reset and reads them back", () => {
    const storage = memoryStorage();
    saveResetToken(storage, "reset-1", "0901234567", NOW);
    expect(JSON.parse(storage.getItem(RESET_STORAGE_KEY) ?? "")).toEqual({
      token: "reset-1",
      phone: "0901234567",
      issuedAt: NOW,
    });
    expect(readResetProgress(storage, NOW + 1000)).toEqual({ token: "reset-1", phone: "0901234567", issuedAt: NOW });
  });

  it("saveResetToken_decoyWithinCooldown_keepsTheRealToken", () => {
    // Inside the 60 s cooldown auth-service answers with a decoy token and sends no SMS.
    const storage = memoryStorage();
    saveResetToken(storage, "real", "0901234567", NOW);
    saveResetToken(storage, "decoy", "0901234567", NOW + 10_000);
    expect(readResetProgress(storage, NOW + 10_000)?.token).toBe("real");
  });

  it("replaces the token after the cooldown or for another phone", () => {
    const storage = memoryStorage();
    saveResetToken(storage, "old", "0901234567", NOW);
    saveResetToken(storage, "new", "0901234567", NOW + 61_000);
    expect(readResetProgress(storage, NOW + 61_000)?.token).toBe("new");

    saveResetToken(storage, "other", "0907654321", NOW + 62_000);
    expect(readResetProgress(storage, NOW + 62_000)).toEqual({ token: "other", phone: "0907654321", issuedAt: NOW + 62_000 });
  });

  it("a link token (no phone) always replaces the stored one", () => {
    const storage = memoryStorage();
    saveResetToken(storage, "sms", undefined, NOW);
    saveResetToken(storage, "mail", undefined, NOW + 1000);
    expect(readResetProgress(storage, NOW + 1000)).toEqual({ token: "mail", issuedAt: NOW + 1000 });
  });

  it("an entry older than 15 minutes reads as none and is cleared", () => {
    const storage = memoryStorage();
    saveResetToken(storage, "reset-1", "0901234567", NOW);
    expect(hasResetToken(storage, NOW + 15 * 60_000 - 1)).toBe(true);
    expect(readResetProgress(storage, NOW + 15 * 60_000)).toBeNull();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("unreadable progress reads as none and is cleared", () => {
    const storage = memoryStorage();
    storage.setItem(RESET_STORAGE_KEY, "{not json");
    expect(readResetProgress(storage, NOW)).toBeNull();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
    storage.setItem(RESET_STORAGE_KEY, JSON.stringify({ token: "", issuedAt: NOW }));
    expect(readResetProgress(storage, NOW)).toBeNull();
  });

  it("clearResetProgress removes the entry", () => {
    const storage = memoryStorage();
    saveResetToken(storage, "reset-1", undefined, NOW);
    clearResetProgress(storage);
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("blocked or missing storage reads as none and never throws", () => {
    for (const storage of [blockedStorage(), null]) {
      expect(() => saveResetToken(storage, "t", "0901234567", NOW)).not.toThrow();
      expect(readResetProgress(storage, NOW)).toBeNull();
      expect(hasResetToken(storage, NOW)).toBe(false);
      expect(() => clearResetProgress(storage)).not.toThrow();
    }
  });
});

describe("takeTokenFromUrl (S-19)", () => {
  it("takeTokenFromUrl_movesItAndCleansTheAddressBar", () => {
    const storage = memoryStorage();
    const cleaned = takeTokenFromUrl(
      { href: "https://sunvibe.vn/reset-password?token=mail-token&via=email#top" },
      storage,
      NOW,
    );
    // The caller navigates to this path through the router, so the router's URL drops the token too.
    expect(cleaned).toBe("/reset-password?via=email#top");
    expect(readResetProgress(storage, NOW)).toEqual({ token: "mail-token", issuedAt: NOW });
  });

  it("removes an empty token parameter without storing anything", () => {
    const storage = memoryStorage();
    expect(takeTokenFromUrl({ href: "https://sunvibe.vn/reset-password?token=" }, storage, NOW)).toBe("/reset-password");
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("leaves the address alone when there is no token", () => {
    const storage = memoryStorage();
    expect(takeTokenFromUrl({ href: "https://sunvibe.vn/reset-password?via=sms" }, storage, NOW)).toBeNull();
    expect(storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("still cleans the address when storage is blocked", () => {
    expect(takeTokenFromUrl({ href: "https://sunvibe.vn/reset-password?token=t" }, blockedStorage(), NOW)).toBe(
      "/reset-password",
    );
  });
});

describe("resetSectionView (W10-44 pre-hydration, invalid link after mount)", () => {
  const view = (input: Partial<Parameters<typeof resetSectionView>[0]>) =>
    resetSectionView({ mounted: true, fromLink: false, stored: false, tokenInAddress: false, ...input });

  it("before mount shows the form for a reset link and a placeholder otherwise", () => {
    expect(view({ mounted: false, fromLink: true })).toBe("form");
    expect(view({ mounted: false, fromLink: false })).toBe("pending");
    // Storage is never read before mount.
    expect(view({ mounted: false, fromLink: false, stored: true })).toBe("pending");
  });

  it("once mounted shows the form when this tab holds a token", () => {
    expect(view({ stored: true })).toBe("form");
    expect(view({ stored: true, fromLink: true })).toBe("form");
  });

  it("keeps the form while a token still waits in the address (not yet moved)", () => {
    expect(view({ tokenInAddress: true })).toBe("form");
  });

  it("shows the invalid link once mounted with no token, also after a link whose token could not be stored", () => {
    expect(view({})).toBe("invalid");
    // Blocked storage: the token left the address but could not be kept.
    expect(view({ fromLink: true })).toBe("invalid");
  });
});
