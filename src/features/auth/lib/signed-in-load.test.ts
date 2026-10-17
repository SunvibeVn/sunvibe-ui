import { describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "../session/session-store";
import { applySignedInLoad, signedInLoadView } from "./signed-in-load";

type Load = { kind: "ready"; value: number } | { kind: "session" } | { kind: "error" };

const STATUSES: SessionStatus[] = ["signed-out", "restoring", "signed-in", "unavailable"];

describe("signedInLoadView (what /account and /verify-phone show for a load)", () => {
  it("signedInLoad_noResultYet_isLoading", () => {
    for (const status of STATUSES) expect(signedInLoadView<Load>(null, status)).toEqual({ kind: "loading" });
  });

  it("signedInLoad_ready_isTheResult", () => {
    const load: Load = { kind: "ready", value: 7 };
    expect(signedInLoadView(load, "signed-in")).toBe(load);
  });

  it("signedInLoad_error_offersARetry", () => {
    for (const status of STATUSES) expect(signedInLoadView<Load>({ kind: "error" }, status)).toEqual({ kind: "error" });
  });

  it("signedInLoad_sessionResult_storeNoLongerSignedIn_leavesItToRequireSession", () => {
    for (const status of ["signed-out", "restoring", "unavailable"] as const) {
      expect(signedInLoadView<Load>({ kind: "session" }, status)).toEqual({ kind: "none" });
    }
  });

  it("signedInLoad_sessionResult_storeStillSignedIn_offersARetry", () => {
    // callApi can answer "unavailable" without touching the store: a blank page would leave no way on.
    expect(signedInLoadView<Load>({ kind: "session" }, "signed-in")).toEqual({ kind: "error" });
  });
});

describe("applySignedInLoad (a load answer reaches the page only while it is still shown)", () => {
  function sinks(active: boolean) {
    return { isActive: () => active, setLoad: vi.fn(), redirect: vi.fn() };
  }

  it("applySignedInLoad_activeResult_isShown", () => {
    const deps = sinks(true);
    applySignedInLoad<Load>({ kind: "ready", value: 1 }, deps);
    expect(deps.setLoad).toHaveBeenCalledExactlyOnceWith({ kind: "ready", value: 1 });
    expect(deps.redirect).not.toHaveBeenCalled();
  });

  it("applySignedInLoad_activeRedirect_leavesAndKeepsLoading", () => {
    const deps = sinks(true);
    applySignedInLoad<Load>({ redirect: "/account" }, deps);
    expect(deps.redirect).toHaveBeenCalledExactlyOnceWith("/account");
    expect(deps.setLoad).not.toHaveBeenCalled();
  });

  it("applySignedInLoad_inactive_neitherShowsNorRedirects", () => {
    // The content unmounted (navigation away, or re-keyed for another user) before the answer came.
    for (const result of [{ redirect: "/account" }, { kind: "ready", value: 1 }, { kind: "error" }] as const) {
      const deps = sinks(false);
      applySignedInLoad<Load>(result, deps);
      expect(deps.redirect).not.toHaveBeenCalled();
      expect(deps.setLoad).not.toHaveBeenCalled();
    }
  });
});
