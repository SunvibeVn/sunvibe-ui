import type { SiteErrorTexts } from "@/components/layout/site-error-panel";

/**
 * The texts of the root error page and the global error page, equal to `SiteError` in vi.json and en.json (held by
 * site-error-text.test.ts; marketing-landing SV-250). They cannot use next-intl for both languages: the root provider
 * holds only vi.json, and it is gone under global-error. Importing en.json here would ship it to every route (SV-026).
 */
const SITE_ERROR_TEXTS: Record<"vi" | "en", SiteErrorTexts> = {
  vi: {
    title: "Đã có lỗi xảy ra",
    message: "Trang chưa tải được. Vui lòng thử lại sau ít phút.",
    retry: "Thử lại",
    home: "Về trang chủ",
  },
  en: {
    title: "Something went wrong",
    message: "The page could not be loaded. Please try again in a few minutes.",
    retry: "Try again",
    home: "Back to home",
  },
};

export function siteErrorText(lang: "vi" | "en"): SiteErrorTexts {
  return SITE_ERROR_TEXTS[lang];
}
