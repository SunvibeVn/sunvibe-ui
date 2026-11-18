import { useSyncExternalStore } from "react";

import { screenLanguage } from "@/i18n/screen-language";

const subscribeNoop = () => () => {};

/**
 * The language of the screen at the browser's path, read only after hydration (marketing-landing SV-250).
 *
 * The root 404 is prerendered once and served for every unmatched URL, so the server cannot know the browser's path
 * (Next 16.4 use-pathname.md, "Avoid hydration mismatch with rewrites"). The server render and the hydrating render are
 * therefore Vietnamese, the document's language (ADR-008); the browser's path decides every render after that, so an
 * English section switches to English with no hydration error (G2 D-48).
 */
export function useScreenLanguage(): "vi" | "en" {
  return useSyncExternalStore<"vi" | "en">(
    subscribeNoop,
    () => screenLanguage(window.location.pathname),
    () => "vi",
  );
}
