import { PRODUCTION_SITE_URL } from "@/config/production-site";
import { mailto } from "@/lib/utils/mailto";

const CONTACT_EMAIL = "admin@sunvibe.vn";

export const siteConfig = {
  name: "Sunvibe",
  legalName: "SunVibe",
  // Root metadata, search results and share previews. [DEL-5] D-AI-1 (W32/W33 plan, Task G3): the field and the
  // audience only, no capability, city, price or legal status (SV-011, SV-180); the marketing-launch brief replaces it.
  // Literals, not next-intl messages: reading messages here would make the root metadata runtime data (known-issues
  // 2026-10-18); moving it is SV-155's copy work.
  title: "Sunvibe | Thuê và cho thuê bất động sản",
  description: "Sunvibe dành cho chủ nhà muốn cho thuê bất động sản và người đang tìm nơi để thuê.",
  // Any origin but www's is a test host: noindex, an empty sitemap and the test banner (W35a Task U1).
  url: process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_SITE_URL,
  locale: "vi_VN",
  logo: "/images/brand/sunvibe-logo.png",
  contactEmail: CONTACT_EMAIL,
  links: {
    contact: mailto(CONTACT_EMAIL),
    waitlist: mailto(CONTACT_EMAIL, "Sunvibe Early Access Request"),
  },
} as const;
