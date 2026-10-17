import { describe, expect, it } from "vitest";
import type { SessionSnapshot, SessionUser } from "../session/session-store";
import {
  afterSignOut,
  exitView,
  nextExit,
  fillSeconds,
  hasAnyRole,
  loginRedirectUrl,
  privateContentShown,
  rateLimitSeconds,
  sessionView,
} from "./session-view";

const user: SessionUser = {
  userId: "u-1",
  fullName: "Nguyen Van A",
  username: "a",
  roles: ["SALE"],
  phoneVerified: true,
  emailVerified: false,
};

describe("sessionView (W10-34)", () => {
  it("sessionView_restoring_isLoading", () => {
    expect(sessionView({ status: "restoring", user: null })).toBe("loading");
  });

  it("sessionView_signedOut_isRedirectLogin", () => {
    expect(sessionView({ status: "signed-out", user: null })).toBe("redirect-login");
    expect(sessionView({ status: "signed-out", user: null, endedBy: "signed-out" })).toBe("redirect-login");
  });

  it("sessionView_endedExpired_isRedirectExpired", () => {
    expect(sessionView({ status: "signed-out", user: null, endedBy: "expired" })).toBe("redirect-expired");
  });

  it("sessionView_unavailable_isUnavailable", () => {
    expect(sessionView({ status: "unavailable", user: null })).toBe("unavailable");
    expect(sessionView({ status: "unavailable", user, retryAfterSeconds: 30 })).toBe("unavailable");
  });

  it("sessionView_signedIn_isContent", () => {
    expect(sessionView({ status: "signed-in", user })).toBe("content");
  });
});

describe("hasAnyRole (W10-35)", () => {
  it("hasAnyRole_superAdmin_satisfiesAdmin", () => {
    expect(hasAnyRole(["SUPER_ADMIN"], ["ADMIN"])).toBe(true);
  });

  it("hasAnyRole_matchingRole_isTrue", () => {
    expect(hasAnyRole(["SALE", "MANAGER"], ["MANAGER"])).toBe(true);
  });

  it("hasAnyRole_noMatch_isFalse", () => {
    expect(hasAnyRole(["SALE"], ["ADMIN", "MANAGER"])).toBe(false);
    expect(hasAnyRole([], ["ADMIN"])).toBe(false);
    expect(hasAnyRole(["SALE"], [])).toBe(false);
  });

  it("hasAnyRole_admin_doesNotSatisfySuperAdmin", () => {
    expect(hasAnyRole(["ADMIN"], ["SUPER_ADMIN"])).toBe(false);
  });
});

describe("loginRedirectUrl", () => {
  it("loginRedirectUrl_signedOut_carriesEncodedNext", () => {
    expect(loginRedirectUrl("/staff/deals?scope=all&page=2", false)).toBe(
      "/login?next=%2Fstaff%2Fdeals%3Fscope%3Dall%26page%3D2",
    );
  });

  it("loginRedirectUrl_expired_addsSessionExpired", () => {
    expect(loginRedirectUrl("/account", true)).toBe("/login?session=expired&next=%2Faccount");
  });

  it("loginRedirectUrl_unsafePath_fallsBackToRoot", () => {
    expect(loginRedirectUrl("//evil.com", false)).toBe("/login?next=%2F");
    expect(loginRedirectUrl("https://evil.com/x", true)).toBe("/login?session=expired&next=%2F");
  });
});

describe("rateLimitSeconds", () => {
  const unavailable = (retryAfterSeconds?: number): SessionSnapshot => ({
    status: "unavailable",
    user: null,
    retryAfterSeconds,
  });

  it("rateLimitSeconds_afterA429_isTheSeconds", () => {
    expect(rateLimitSeconds(unavailable(42))).toBe(42);
  });

  it("rateLimitSeconds_roundsUpFractions", () => {
    expect(rateLimitSeconds(unavailable(1.2))).toBe(2);
  });

  it("rateLimitSeconds_withoutRetryAfter_isNull", () => {
    expect(rateLimitSeconds(unavailable())).toBeNull();
    expect(rateLimitSeconds(unavailable(0))).toBeNull();
    expect(rateLimitSeconds(unavailable(Number.NaN))).toBeNull();
  });
});

describe("afterSignOut (S-24, C-5)", () => {
  it("afterSignOut_done_leaves", () => {
    expect(afterSignOut("done", true)).toBe("leave");
    expect(afterSignOut("done", false)).toBe("leave");
  });

  it("afterSignOut_serverFailedWithFailedText_showsIt", () => {
    expect(afterSignOut("server-failed", true)).toBe("show-failed");
  });

  it("afterSignOut_serverFailedWithoutFailedText_leavesWithFlagKept", () => {
    expect(afterSignOut("server-failed", false)).toBe("leave");
  });
});

describe("fillSeconds", () => {
  it("fillSeconds_replacesEveryPlaceholder", () => {
    expect(fillSeconds("Vui lòng thử lại sau {n} giây.", 42)).toBe("Vui lòng thử lại sau 42 giây.");
    expect(fillSeconds("{n} / {n}", 3)).toBe("3 / 3");
  });

  it("fillSeconds_withoutPlaceholder_keepsTheText", () => {
    expect(fillSeconds("Try again later.", 5)).toBe("Try again later.");
  });
});

describe("nextExit (sign-out on this device, auth-browser-session §4.6, S-24, C-5)", () => {
  it("nextExit_start_fromIdle_isSigningOut", () => {
    expect(nextExit("idle", { type: "start" })).toBe("signing-out");
  });

  it("nextExit_start_whileBusy_isIgnored", () => {
    expect(nextExit("signing-out", { type: "start" })).toBe("signing-out");
    expect(nextExit("retrying", { type: "start" })).toBe("retrying");
    expect(nextExit("leaving", { type: "start" })).toBe("leaving");
    expect(nextExit("failed", { type: "start" })).toBe("failed");
  });

  it("nextExit_done_isLeaving", () => {
    expect(nextExit("signing-out", { type: "signed-out", result: "done", hasFailedText: true })).toBe("leaving");
  });

  it("nextExit_serverFailedWithFailedText_isFailed", () => {
    expect(nextExit("signing-out", { type: "signed-out", result: "server-failed", hasFailedText: true })).toBe(
      "failed",
    );
  });

  it("nextExit_serverFailedWithoutFailedText_isLeaving", () => {
    expect(nextExit("signing-out", { type: "signed-out", result: "server-failed", hasFailedText: false })).toBe(
      "leaving",
    );
  });

  it("nextExit_resultOutsideSigningOut_isIgnored", () => {
    expect(nextExit("idle", { type: "signed-out", result: "done", hasFailedText: true })).toBe("idle");
  });

  it("nextExit_tryAgain_fromFailed_isRetrying", () => {
    expect(nextExit("failed", { type: "try-again" })).toBe("retrying");
    expect(nextExit("idle", { type: "try-again" })).toBe("idle");
    expect(nextExit("retrying", { type: "try-again" })).toBe("retrying");
  });

  it("nextExit_retried_stillPending_isFailed_elseLeaving", () => {
    expect(nextExit("retrying", { type: "retried", stillPending: true })).toBe("failed");
    expect(nextExit("retrying", { type: "retried", stillPending: false })).toBe("leaving");
    expect(nextExit("failed", { type: "retried", stillPending: false })).toBe("failed");
  });
});

describe("exitView", () => {
  it("exitView_idle_isNull_soTheSessionDecides", () => {
    expect(exitView("idle")).toBeNull();
  });

  it("exitView_pendingOrLeavingForHome_isNeutralBusy_notTheLoginText", () => {
    expect(exitView("signing-out")).toBe("busy");
    expect(exitView("leaving")).toBe("busy");
  });

  it("exitView_failedOrRetrying_isLogoutFailed", () => {
    expect(exitView("failed")).toBe("logout-failed");
    expect(exitView("retrying")).toBe("logout-failed");
  });

  // Final review security M-1: a route hidden by <Activity> keeps no private children mounted.
  it("privateContentShown_onlyWhileVisibleAndSignedIn", () => {
    expect(privateContentShown("content", true)).toBe(true);
    expect(privateContentShown("content", false)).toBe(false);
    for (const view of ["loading", "redirect-login", "redirect-expired", "unavailable"] as const) {
      expect(privateContentShown(view, true)).toBe(false);
      expect(privateContentShown(view, false)).toBe(false);
    }
  });
});
