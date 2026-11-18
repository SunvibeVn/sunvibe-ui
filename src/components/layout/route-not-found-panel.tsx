"use client";

import { NotFoundPanel, type NotFoundTexts } from "./not-found-panel";
import { useScreenLanguage } from "./use-screen-language";

/**
 * The 404 panel in the language of the screen (G2 D-48): Vietnamese in the server HTML and the hydrating render on
 * every path, English after hydration under an English section (marketing-landing SV-250).
 */
export function RouteNotFoundPanel({ vietnamese, english }: { vietnamese: NotFoundTexts; english: NotFoundTexts }) {
  const lang = useScreenLanguage();
  return <NotFoundPanel texts={lang === "en" ? english : vietnamese} lang={lang} />;
}
