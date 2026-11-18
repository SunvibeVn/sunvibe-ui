import type en from "./messages/en.json";
import type vi from "./messages/vi.json";
import type { AppLocale } from "./config";

// Type-checks message keys and the locale for next-intl (useTranslations, getTranslations). vi.json holds the public
// site, en.json the staff workspace (C-41); their namespaces are disjoint apart from `Session`, `TestEnvironment`,
// `NotFound` and `SiteError` (the 404 and error pages, marketing-landing SV-250).
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof vi & typeof en;
  }
}
