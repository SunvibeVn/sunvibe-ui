import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_FE_COOKIES,
  clearHint,
  clearLogoutPending,
  cookiesAndStorageWork,
  documentJar,
  hintCookieName,
  isLogoutPending,
  newGeneration,
  pendingCookieName,
  readHint,
  setLogoutPending,
  writeHint,
} from "./browser-cookies";
import { memoryStorage } from "../lib/test-support/memory-storage";

/** Minimal `document.cookie` model: the setter takes one cookie string, the getter returns `name=value` pairs. */
class FakeJar {
  readonly writes: string[] = [];
  private readonly store = new Map<string, string>();
  constructor(private readonly enabled = true) {}

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    this.writes.push(raw);
    if (!this.enabled) return;
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    if (expired) this.store.delete(name);
    else this.store.set(name, value);
  }
}

function attributesOf(raw: string): string[] {
  return raw.split(";").map((part) => part.trim());
}

describe("browser cookies (W10-41, W10-43)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writeHint_production_hostPrefixSecureLaxSevenDays", () => {
    const jar = new FakeJar();
    writeHint(jar, "abc123", true);
    const parts = attributesOf(jar.writes[0]);
    expect(parts[0]).toBe("__Host-sv_signed_in=abc123");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "SameSite=Lax", "Max-Age=604800", "Secure"]));
    expect(parts.some((part) => part.startsWith("Domain"))).toBe(false);
    expect(hintCookieName(true)).toBe("__Host-sv_signed_in");
    expect(readHint(jar, true)).toBe("abc123");
  });

  it("writeHint_development_plainNameNoSecure", () => {
    const jar = new FakeJar();
    writeHint(jar, "gen-1", false);
    const parts = attributesOf(jar.writes[0]);
    expect(parts[0]).toBe("sv_signed_in=gen-1");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "SameSite=Lax", "Max-Age=604800"]));
    expect(parts).not.toContain("Secure");
    expect(hintCookieName(false)).toBe("sv_signed_in");
    // Vitest runs with NODE_ENV=test, so the default is the development name.
    expect(hintCookieName()).toBe("sv_signed_in");
    expect(readHint(jar)).toBe("gen-1");
  });

  it("clearHint_writesMaxAgeZero", () => {
    const jar = new FakeJar();
    writeHint(jar, "gen-1", true);
    clearHint(jar, true);
    const parts = attributesOf(jar.writes[1]);
    expect(parts[0]).toBe("__Host-sv_signed_in=");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "SameSite=Lax", "Max-Age=0", "Secure"]));
    expect(readHint(jar, true)).toBeNull();
  });

  it("readHint_missing_isNull", () => {
    const jar = new FakeJar();
    expect(readHint(jar, false)).toBeNull();
    jar.cookie = "other=1; Path=/";
    jar.cookie = "xsv_signed_in=2; Path=/";
    expect(readHint(jar, false)).toBeNull();
    expect(readHint({ cookie: "" }, false)).toBeNull();
  });

  it("pendingFlag_roundTrip", () => {
    const jar = new FakeJar();
    expect(isLogoutPending(jar, true)).toBe(false);
    setLogoutPending(jar, true);
    const parts = attributesOf(jar.writes[0]);
    expect(parts[0]).toBe("__Host-sv_logout_pending=1");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "SameSite=Lax", "Max-Age=604800", "Secure"]));
    expect(isLogoutPending(jar, true)).toBe(true);
    clearLogoutPending(jar, true);
    expect(attributesOf(jar.writes[1])).toContain("Max-Age=0");
    expect(isLogoutPending(jar, true)).toBe(false);
    expect(pendingCookieName(false)).toBe("sv_logout_pending");
    expect(pendingCookieName(true)).toBe("__Host-sv_logout_pending");
  });

  it("newGeneration_is32HexCharsFrom16Bytes", () => {
    const lengths: number[] = [];
    const random = {
      getRandomValues(array: Uint8Array) {
        lengths.push(array.length);
        array.forEach((_, index) => (array[index] = index === 0 ? 0x0a : 0xff));
        return array;
      },
    };
    const generation = newGeneration(random);
    expect(lengths).toEqual([16]);
    expect(generation).toBe("0a" + "ff".repeat(15));
    expect(newGeneration()).toMatch(/^[0-9a-f]{32}$/);
    expect(newGeneration()).not.toBe(newGeneration());
  });

  it("newGeneration_withoutRandomUUID_works", () => {
    // Plain-http LAN origins expose getRandomValues but not randomUUID.
    const random = { getRandomValues: (array: Uint8Array) => globalThis.crypto.getRandomValues(array) };
    expect("randomUUID" in random).toBe(false);
    expect(newGeneration(random)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("cookiesAndStorageWork_cookieDisabled_isFalse", () => {
    expect(
      cookiesAndStorageWork({
        navigator: { cookieEnabled: false },
        document: new FakeJar(),
        sessionStorage: memoryStorage(),
      }),
    ).toBe(false);
    // The flag lies but the write does not stick.
    expect(
      cookiesAndStorageWork({
        navigator: { cookieEnabled: true },
        document: new FakeJar(false),
        sessionStorage: memoryStorage(),
      }),
    ).toBe(false);
  });

  it("cookiesAndStorageWork_storageThrows_isFalse", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    expect(
      cookiesAndStorageWork({ navigator: { cookieEnabled: true }, document: new FakeJar(), sessionStorage: storage }),
    ).toBe(false);
  });

  it("cookiesAndStorageWork_storageGetterThrows_isFalse", () => {
    // Blocked site data: reading window.sessionStorage itself throws a SecurityError.
    const env = {
      navigator: { cookieEnabled: true },
      document: new FakeJar(),
      get sessionStorage(): Storage {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(cookiesAndStorageWork(env)).toBe(false);
  });

  it("cookiesAndStorageWork_everythingWorks_isTrue", () => {
    const jar = new FakeJar();
    const storage = memoryStorage();
    expect(cookiesAndStorageWork({ navigator: { cookieEnabled: true }, document: jar, sessionStorage: storage })).toBe(
      true,
    );
    // The check leaves nothing behind.
    expect(jar.cookie).toBe("");
    expect(storage.length).toBe(0);
    expect(jar.writes[0].startsWith("sv_cookie_check=")).toBe(true);
  });

  it("documentJar_withoutDocument_readsEmptyAndIgnoresWrites", () => {
    expect(typeof document).toBe("undefined");
    expect(documentJar.cookie).toBe("");
    expect(() => {
      documentJar.cookie = "sv_signed_in=g; Path=/";
    }).not.toThrow();
    expect(readHint(documentJar)).toBeNull();
  });

  it("documentJar_withDocument_readsAndWritesDocumentCookie", () => {
    const jar = new FakeJar();
    vi.stubGlobal("document", jar);
    writeHint(documentJar, "gen-1", false);
    expect(jar.writes).toEqual(["sv_signed_in=gen-1; Path=/; SameSite=Lax; Max-Age=604800"]);
    expect(readHint(documentJar, false)).toBe("gen-1");
  });

  it("lists the legacy FE cookies", () => {
    expect(LEGACY_FE_COOKIES).toEqual(["sv_at", "sv_rt", "__Host-sv_at", "__Host-sv_rt", "sv_signup", "sv_reset"]);
  });
});
