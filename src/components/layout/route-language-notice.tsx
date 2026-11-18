"use client";

import { usePathname } from "next/navigation";

import { isEnglishScreen } from "@/i18n/screen-language";

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
