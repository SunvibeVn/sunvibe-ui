import type messages from "./messages/vi.json";
import type { AppLocale } from "./config";

// Type-checks message keys and the locale for next-intl (useTranslations, getTranslations).
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
