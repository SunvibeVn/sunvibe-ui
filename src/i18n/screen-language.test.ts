import { describe, expect, it } from "vitest";

import { isEnglishScreen, screenLanguage } from "./screen-language";

// The one list of English screens of the test banner, the 404 page and the error pages (G2 D-48,
// marketing-landing SV-250).
describe("the language of a screen (marketing-landing SV-250)", () => {
  it.each([
    "/workspace",
    "/workspace/owner-leads/123",
    "/login",
    "/login/phone",
    "/sign-up",
    "/sign-up/details",
    "/forgot-password",
    "/reset-password",
    "/verify-phone",
    "/account",
    "/account/email",
  ])("isEnglishScreen_englishSections_true (%s)", (pathname) => {
    expect(isEnglishScreen(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/list-with-us",
    "/nowhere",
    "/accounts",
    "/workspaces",
    "/login-help",
    "/properties/can-ho-td-abcd-efgh",
    "/_not-found",
  ])("isEnglishScreen_otherPaths_false (%s)", (pathname) => {
    expect(isEnglishScreen(pathname)).toBe(false);
  });

  it("screenLanguage_followsTheList", () => {
    expect(screenLanguage("/workspace/x")).toBe("en");
    expect(screenLanguage("/account")).toBe("en");
    expect(screenLanguage("/")).toBe("vi");
    expect(screenLanguage("/list-with-us")).toBe("vi");
    expect(screenLanguage("")).toBe("vi");
  });
});
