/**
 * The screens that are English today; every other route is a public page, which is Vietnamese. No screen mixes
 * languages (G2 D-48), so the test banner, the 404 page and the error pages take the language of the screen from this
 * one list (marketing-landing SV-250):
 * - the staff workspace (C-41, D-48);
 * - the auth and onboarding screens and the account pages, English until the translation wave (D-48: "/login and
 *   /account stay English as today").
 * A screen that changes language changes here too.
 */
const ENGLISH_SECTIONS = [
  "/workspace",
  "/login",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-phone",
  "/account",
];

export function isEnglishScreen(pathname: string): boolean {
  return ENGLISH_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}

export function screenLanguage(pathname: string): "vi" | "en" {
  return isEnglishScreen(pathname) ? "en" : "vi";
}
