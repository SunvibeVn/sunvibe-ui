import { describe, expect, it } from "vitest";
import { englishSessionTexts } from "./english-session-texts";

describe("englishSessionTexts (auth-browser-session §7)", () => {
  it("englishSessionTexts_keepsTheSection7SentencesVerbatim", () => {
    expect(englishSessionTexts.unavailableBody).toBe(
      "We couldn't reach the server to restore your session. You're still signed in.",
    );
    expect(englishSessionTexts.retry).toBe("Try again");
    expect(englishSessionTexts.signOutHere).toBe("Sign out on this device");
    expect(englishSessionTexts.logoutFailed).toBe(
      "You're signed out on this device, but we couldn't end your session on the server.",
    );
    expect(englishSessionTexts.tryAgain).toBe("Try again");
  });

  it("englishSessionTexts_titlesDoNotRepeatTheirBodies", () => {
    expect(englishSessionTexts.expiredTitle).toBe("Session expired");
    expect(englishSessionTexts.expiredBody.startsWith(englishSessionTexts.expiredTitle)).toBe(false);
    // An empty title is hidden by the Alert: the unavailable block shows its sentence once.
    expect(englishSessionTexts.unavailableTitle).toBe("");
  });
});
