"use client";

import { Logo } from "@/components/brand/logo";
import { siteErrorText } from "@/i18n/site-error-text";

import { SiteErrorPanel } from "./site-error-panel";
import { useScreenLanguage } from "./use-screen-language";

/**
 * The error panel of the root error page and the global error page, in the language of the screen (G2 D-48): Vietnamese
 * in the server HTML and the hydrating render, English after hydration under an English section (marketing-landing
 * SV-250). The texts come from siteErrorText, not next-intl, so no messages file reaches every route's bundle.
 */
export function RouteSiteErrorPanel({ retry }: { retry: () => void }) {
  const lang = useScreenLanguage();
  return (
    <div className="flex flex-col items-center gap-6">
      <Logo />
      <SiteErrorPanel texts={siteErrorText(lang)} retry={retry} lang={lang} />
    </div>
  );
}
