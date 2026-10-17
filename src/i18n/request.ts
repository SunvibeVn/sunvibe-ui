import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// next-intl "without i18n routing" setup: one locale for every request (D-15, C-FE-1).
// Nothing here reads headers or cookies, so routes stay prerenderable with cacheComponents.
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  timeZone: "Asia/Ho_Chi_Minh",
  messages: (await import("./messages/vi.json")).default,
}));
