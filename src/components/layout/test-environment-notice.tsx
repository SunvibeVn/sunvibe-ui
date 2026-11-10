import { Suspense } from "react";
import { isProductionSite } from "@/config/production-site";
import en from "@/i18n/messages/en.json";
import vi from "@/i18n/messages/vi.json";
import { RouteLanguageNotice } from "./route-language-notice";

/**
 * The test-environment banner of every host but www (W35a plan D-10). The root layout renders it after every page, a
 * 404 included. On www it renders nothing at all, so the production pages stay as they are.
 *
 * The English screens get the plain English equivalent of D-10 (G2 D-48: no screen mixes languages). The route decides
 * the language, and while a route with a dynamic param prerenders its path is not known yet, so the notice waits in
 * Suspense there (Cache Components) and streams in with the page.
 */
export function TestEnvironmentNotice({ siteUrl }: { siteUrl: string }) {
  if (isProductionSite(siteUrl)) return null;

  return (
    <Suspense fallback={null}>
      <RouteLanguageNotice vietnamese={vi.TestEnvironment.notice} english={en.TestEnvironment.notice} />
    </Suspense>
  );
}
