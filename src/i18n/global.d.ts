import type en from "./messages/en.json";
import type vi from "./messages/vi.json";
import type { AppLocale } from "./config";

// Type-checks message keys and the locale for next-intl (useTranslations, getTranslations). vi.json holds the public
// site, en.json the staff workspace (C-41); their namespaces are disjoint apart from `Session`.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof vi & typeof en;
  }
}
