"use client";

import { usePathname } from "next/navigation";

/**
 * The screens that are English today; every other route is a public page, which is Vietnamese. No screen mixes
 * languages (G2 D-48), so the notice takes the language of the screen:
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

const isEnglishScreen = (pathname: string): boolean =>
  ENGLISH_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));

/**
 * A one-line notice in the language of the screen. The texts come in as props, because the root layout that renders it
 * sits above the workspace's English message provider.
 *
 * The root layout renders it after the page, and it sticks to the bottom of the window: it stays in view while the page
 * scrolls and sits at the end of the page once scrolled there, so it never moves a sticky header or the workspace's
 * mobile drawer, which start at the top of the window, and covers nothing at the end of a page.
 */
export function RouteLanguageNotice({ vietnamese, english }: { vietnamese: string; english: string }) {
  const inEnglish = isEnglishScreen(usePathname());

  return (
    <p
      role="note"
      lang={inEnglish ? "en" : "vi"}
      className="sticky bottom-0 z-30 border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      {inEnglish ? english : vietnamese}
    </p>
  );
}
