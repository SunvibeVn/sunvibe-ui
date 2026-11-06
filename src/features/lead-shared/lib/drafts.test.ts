import { describe, expect, it, vi } from "vitest";

// The hook is not rendered here (node environment); only the store and the session guard are tested.
vi.mock("@/features/auth/client", () => ({
  useSession: () => ({ status: "restoring", user: null }),
}));

import {
  createDraftSessionGuard,
  createDraftStore,
  createTabMemory,
  type DraftKey,
  type DraftSessionView,
  readFormDraft,
  writeFormDraft,
} from "./drafts";

const key = (userId: string, leadId: string, form: DraftKey["form"] = "activity"): DraftKey => ({ userId, leadId, form });

const signedIn = (userId: string): DraftSessionView => ({ status: "signed-in", user: { userId } });

describe("createDraftStore", () => {
  it("drafts survive unmount and clear on user change", () => {
    const store = createDraftStore();
    store.set(key("u1", "L2"), "gọi lại lúc 9h");
    // A new mount builds a new key object: the draft is read back by value (W11-43).
    expect(store.get({ userId: "u1", leadId: "L2", form: "activity" })).toBe("gọi lại lúc 9h");

    store.resetFor("u2");
    expect(store.get(key("u1", "L2"))).toBeUndefined();

    store.set(key("u2", "L2"), "của u2");
    store.resetFor(null);
    expect(store.get(key("u2", "L2"))).toBeUndefined();
  });

  it("keeps the drafts of the user it is reset for", () => {
    const store = createDraftStore();
    store.set(key("u1", "L1", "assignNote"), "chủ nhà rút");
    store.set(key("u2", "L1", "assignNote"), "other");
    store.resetFor("u1");
    expect(store.get(key("u1", "L1", "assignNote"))).toBe("chủ nhà rút");
    expect(store.get(key("u2", "L1", "assignNote"))).toBeUndefined();
  });

  it("separates drafts by user, lead and form", () => {
    const store = createDraftStore();
    store.set(key("u1", "L1", "activity"), "a");
    store.set(key("u1", "L1", "duplicate"), "b");
    store.set(key("u1", "L2", "activity"), "c");
    expect(store.get(key("u1", "L1", "activity"))).toBe("a");
    expect(store.get(key("u1", "L1", "duplicate"))).toBe("b");
    expect(store.get(key("u1", "L2", "activity"))).toBe("c");
    expect(store.get(key("u2", "L1", "activity"))).toBeUndefined();
    // No ambiguity when ids contain separators.
    store.set(key("u1:L", "1", "activity"), "x");
    expect(store.get(key("u1", "L:1", "activity"))).toBeUndefined();
  });

  it("clears one draft (after a success) and treats an empty text as no draft", () => {
    const store = createDraftStore();
    store.set(key("u1", "L1"), "a");
    store.set(key("u1", "L1", "duplicate"), "SV-1");
    store.clear(key("u1", "L1"));
    expect(store.get(key("u1", "L1"))).toBeUndefined();
    expect(store.get(key("u1", "L1", "duplicate"))).toBe("SV-1");
    store.set(key("u1", "L1", "duplicate"), "");
    expect(store.get(key("u1", "L1", "duplicate"))).toBeUndefined();
  });

  it("clears only the text that was sent when given (CR-2, CR-3: an old submit never clears newer typing)", () => {
    const store = createDraftStore();
    store.set(key("u1", "L1"), "sent text");
    store.clear(key("u1", "L1"), "other text");
    expect(store.get(key("u1", "L1"))).toBe("sent text");
    store.clear(key("u1", "L1"), "sent text");
    expect(store.get(key("u1", "L1"))).toBeUndefined();

    // Typed again after the submit started: the new text stays.
    store.set(key("u1", "L1"), "typed later");
    store.clear(key("u1", "L1"), "sent text");
    expect(store.get(key("u1", "L1"))).toBe("typed later");
  });

  it("tells subscribers about changes only", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(key("u1", "L1"), "a");
    store.set(key("u1", "L1"), "a");
    store.clear(key("u1", "L9"));
    store.resetFor("u1");
    expect(listener).toHaveBeenCalledTimes(1);
    store.resetFor(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.set(key("u1", "L1"), "b");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("never touches a storage API", () => {
    const touched = vi.fn(() => {
      throw new Error("storage must not be used");
    });
    const fake = { getItem: touched, setItem: touched, removeItem: touched, clear: touched, key: touched, length: 0 };
    vi.stubGlobal("localStorage", fake);
    vi.stubGlobal("sessionStorage", fake);
    vi.stubGlobal("indexedDB", { open: touched });
    try {
      const store = createDraftStore();
      store.set(key("u1", "L1"), "a");
      store.get(key("u1", "L1"));
      store.clear(key("u1", "L1"));
      store.resetFor(null);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createDraftSessionGuard (C-33)", () => {
  it("clears drafts of other users when the signed-in user changes, and all of them on sign-out", () => {
    const store = createDraftStore();
    const guard = createDraftSessionGuard(store);
    guard.observe(signedIn("u1"));
    store.set(key("u1", "L2"), "note u1");

    guard.observe(signedIn("u1"));
    expect(store.get(key("u1", "L2"))).toBe("note u1");

    guard.observe(signedIn("u2"));
    expect(store.get(key("u1", "L2"))).toBeUndefined();

    store.set(key("u2", "L2"), "note u2");
    guard.observe({ status: "signed-out", user: null });
    expect(store.get(key("u2", "L2"))).toBeUndefined();
  });

  it("keeps drafts while the session is unavailable or restoring (E-8)", () => {
    const store = createDraftStore();
    const guard = createDraftSessionGuard(store);
    guard.observe(signedIn("u1"));
    store.set(key("u1", "L2"), "note u1");

    guard.observe({ status: "unavailable", user: { userId: "u1" } });
    guard.observe({ status: "unavailable", user: null });
    guard.observe({ status: "restoring", user: null });
    expect(store.get(key("u1", "L2"))).toBe("note u1");

    guard.observe(signedIn("u1"));
    expect(store.get(key("u1", "L2"))).toBe("note u1");
  });

  it("drops a former user's drafts when another user signs in after a restore", () => {
    const store = createDraftStore();
    const guard = createDraftSessionGuard(store);
    guard.observe(signedIn("u1"));
    store.set(key("u1", "L2"), "note u1");
    guard.observe({ status: "restoring", user: null });
    guard.observe({ status: "signed-in", user: { userId: "u3" } });
    expect(store.get(key("u1", "L2"))).toBeUndefined();
  });

  it("drops drafts left from before the first observation when a user is first seen", () => {
    const store = createDraftStore();
    store.set(key("u1", "L2"), "stale");
    const guard = createDraftSessionGuard(store);
    guard.observe({ status: "restoring", user: null });
    expect(store.get(key("u1", "L2"))).toBe("stale");
    guard.observe(signedIn("u2"));
    expect(store.get(key("u1", "L2"))).toBeUndefined();
  });
});

describe("createTabMemory (SEC-M2: the app-level sync drops everything with no form on screen)", () => {
  it("a signed-out session drops the drafts, the list notice and the last list URL, with nothing subscribed", () => {
    const memory = createTabMemory();
    memory.guard.observe(signedIn("u1"));
    memory.drafts.set(key("u1", "L2"), "note u1");
    memory.drafts.set(key("u1", "L2", "assignNote"), "reason u1");
    memory.listFlash.set("u1", "leadNotFound");
    memory.lastListUrl.set("u1", "/workspace/owner-leads?scope=all");

    // Signed out outside the workspace (e.g. a logout that failed on the server): no form, no list mounted.
    memory.guard.observe({ status: "signed-out", user: null });

    expect(memory.drafts.get(key("u1", "L2"))).toBeUndefined();
    expect(memory.drafts.get(key("u1", "L2", "assignNote"))).toBeUndefined();
    expect(memory.listFlash.take("u1")).toBeNull();
    expect(memory.lastListUrl.get("u1")).toBeNull();
  });

  it("another user signing in drops the former user's memory and keeps nothing for them", () => {
    const memory = createTabMemory();
    memory.guard.observe(signedIn("u1"));
    memory.drafts.set(key("u1", "L2"), "note u1");
    memory.listFlash.set("u1", "leadNotFound");
    memory.lastListUrl.set("u1", "/workspace/owner-leads?scope=mine");

    memory.guard.observe(signedIn("u2"));

    expect(memory.drafts.get(key("u1", "L2"))).toBeUndefined();
    expect(memory.listFlash.take("u1")).toBeNull();
    expect(memory.lastListUrl.get("u1")).toBeNull();
  });

  it("keeps everything while the session is unavailable (E-8)", () => {
    const memory = createTabMemory();
    memory.guard.observe(signedIn("u1"));
    memory.drafts.set(key("u1", "L2"), "note u1");
    memory.lastListUrl.set("u1", "/workspace/owner-leads?scope=mine");
    memory.guard.observe({ status: "unavailable", user: null });
    expect(memory.drafts.get(key("u1", "L2"))).toBe("note u1");
    expect(memory.lastListUrl.get("u1")).toBe("/workspace/owner-leads?scope=mine");
  });
});

describe("multi-field drafts of the survey dialogs (spec 6.2)", () => {
  const defaults = {
    start: "",
    duration: "60",
    place: { addressText: "25 Trần Phú", wardCode: "20242", latitude: 16.07 as number | null, longitude: 108.22 as number | null },
    ownerConfirmed: false,
  };

  it("round-trips the fields as one JSON text", () => {
    const typed = { ...defaults, start: "2026-10-25T10:00", place: { ...defaults.place, latitude: null, longitude: null } };
    const text = writeFormDraft(typed, defaults);
    expect(typeof text).toBe("string");
    expect(readFormDraft(text, defaults)).toEqual(typed);
  });

  it("keeps no draft for an untouched form", () => {
    expect(writeFormDraft(defaults, defaults)).toBe("");
    expect(readFormDraft("", defaults)).toEqual(defaults);
  });

  it("ignores unreadable text and fields of the wrong type", () => {
    expect(readFormDraft("{not json", defaults)).toEqual(defaults);
    expect(readFormDraft(JSON.stringify({ fields: { start: 5, duration: "90", extra: "x" } }), defaults)).toEqual({
      ...defaults,
      duration: "90",
    });
  });

  it("drops a change draft written for an older appointment version", () => {
    const text = writeFormDraft({ ...defaults, start: "2026-10-25T10:00" }, defaults, 3);
    expect(readFormDraft(text, defaults, 3).start).toBe("2026-10-25T10:00");
    expect(readFormDraft(text, defaults, 4)).toEqual(defaults);
  });

  it("drops a draft typed for another appointment with the same version (tag = id and version)", () => {
    const text = writeFormDraft({ ...defaults, start: "2026-10-25T10:00" }, defaults, "A1:0");
    expect(readFormDraft(text, defaults, "A1:0").start).toBe("2026-10-25T10:00");
    expect(readFormDraft(text, defaults, "A2:0")).toEqual(defaults);
  });

  it("keeps only the fields the user changed, laid over newer defaults (a reload after a conflict)", () => {
    const text = writeFormDraft({ ...defaults, start: "2026-10-25T10:00" }, defaults, "A1:0");
    const newer = { ...defaults, duration: "90", place: { ...defaults.place, addressText: "7 Lê Lợi" } };
    expect(readFormDraft(text, newer, "A1:0")).toEqual({ ...newer, start: "2026-10-25T10:00" });
  });

  it("is dropped on sign-out like every draft", () => {
    const memory = createTabMemory();
    memory.guard.observe(signedIn("U1"));
    const surveyKey: DraftKey = { userId: "U1", leadId: "L1", form: "surveyBook" };
    memory.drafts.set(surveyKey, writeFormDraft({ ...defaults, start: "2026-10-25T10:00" }, defaults));
    memory.guard.observe({ status: "signed-out", user: null });
    expect(memory.drafts.get(surveyKey)).toBeUndefined();
  });
});
