import { describe, expect, it, vi } from "vitest";

import { type HistoryGuardHost, installHistoryGuard } from "./history-guard";

const TEXT = "You have unsaved changes. Leave this page?";
const PAGE = "/workspace/owner-leads/L1/survey-checklists/C1";

/** A tab on the checklist page with the Navigation API: a traversal fires a `navigate` event before it commits. */
function tab(options: { withNavigationApi?: boolean; answer?: boolean } = {}) {
  const navigation = new EventTarget();
  const confirm = vi.fn(() => options.answer ?? false);
  const addSpy = vi.spyOn(navigation, "addEventListener");
  const host: HistoryGuardHost = {
    navigation: options.withNavigationApi === false ? undefined : navigation,
    pathname: () => PAGE,
    confirm,
  };
  /** Fires the `navigate` event of a navigation to `path`; true when the guard cancelled it. */
  function navigate(path: string, init: { type?: string; cancelable?: boolean } = {}): boolean {
    const event = Object.assign(new Event("navigate", { cancelable: init.cancelable ?? true }), {
      navigationType: init.type ?? "traverse",
      destination: { url: `http://localhost:3000${path}` },
    });
    navigation.dispatchEvent(event);
    return event.defaultPrevented;
  }
  return { host, confirm, addSpy, navigate };
}

describe("installHistoryGuard (SV-010: Back and Forward ask before leaving the checklist page)", () => {
  it("traversalToAnotherPage_stay_cancelsIt", () => {
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate("/workspace/owner-leads/L1")).toBe(true);
    expect(t.confirm).toHaveBeenCalledWith(TEXT);
  });

  it("traversalToAnotherPage_leave_letsItGo", () => {
    const t = tab({ answer: true });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate("/workspace/owner-leads/L1")).toBe(false);
    expect(t.confirm).toHaveBeenCalledOnce();
  });

  it("forwardToAnotherPage_asksTheSame", () => {
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate("/workspace/surveys")).toBe(true);
    expect(t.confirm).toHaveBeenCalledOnce();
  });

  it("traversalWithinThePage_editAndPreviewTabs_asksNothing", () => {
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate(`${PAGE}?tab=preview`)).toBe(false);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it("traversalTheBrowserDoesNotLetThePageCancel_asksNothing", () => {
    // Another document (the unload prompt asks) or no user activation since the last cancel (the browser's rule
    // against trapping Back).
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate("/workspace/owner-leads/L1", { cancelable: false })).toBe(false);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it("pushAndReplace_leftToTheLinkGuard", () => {
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.navigate("/workspace/owner-leads/L1", { type: "push" })).toBe(false);
    expect(t.navigate("/workspace/owner-leads/L1", { type: "replace" })).toBe(false);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it("uninstall_removesTheGuard", () => {
    const t = tab({ answer: false });
    installHistoryGuard(t.host, TEXT)();

    expect(t.navigate("/workspace/owner-leads/L1")).toBe(false);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it("withoutTheNavigationApi_installsNothing", () => {
    const t = tab({ withNavigationApi: false });
    installHistoryGuard(t.host, TEXT);

    expect(t.addSpy).not.toHaveBeenCalled();
  });
});
