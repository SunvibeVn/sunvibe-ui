import { describe, expect, it } from "vitest";
import { sessionStorageOf } from "./session-storage";
import { memoryStorage } from "./test-support/memory-storage";

describe("sessionStorageOf", () => {
  it("resolves the window's sessionStorage, or null when reading it throws", () => {
    const storage = memoryStorage();
    expect(sessionStorageOf({ sessionStorage: storage })).toBe(storage);
    const blockedWindow = {
      get sessionStorage(): Storage {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(sessionStorageOf(blockedWindow)).toBeNull();
  });
});
