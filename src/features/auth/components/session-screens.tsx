"use client";

import { useTranslations } from "next-intl";
import type { SessionTexts } from "../lib/session-view";

// Texts of the screens and blocks of protected pages (auth-browser-session §6, §7). They are Vietnamese from the
// `Session` messages; an English auth screen passes its own `SessionTexts` so no screen mixes languages.

export type { SessionTexts };

/** `texts` when given, otherwise the Vietnamese `Session` messages. */
export function useSessionTexts(texts?: SessionTexts): SessionTexts {
  const t = useTranslations("Session");
  if (texts) return texts;
  return {
    loading: t("loading"),
    leaving: t("leaving"),
    expiredTitle: t("expired.title"),
    expiredBody: t("expired.body"),
    expiredLink: t("expired.link"),
    unavailableTitle: t("unavailable.title"),
    unavailableBody: t("unavailable.body"),
    rateLimited: t.raw("unavailable.rateLimited") as string,
    retry: t("unavailable.retry"),
    signOutHere: t("unavailable.signOutHere"),
  };
}
