import { mailto } from "@/lib/utils/mailto";

const CONTACT_EMAIL = "admin@sunvibe.vn";

export const siteConfig = {
  name: "Sunvibe",
  legalName: "SunVibe",
  title: "Sunvibe | AI-Powered Property Rentals",
  description:
    "Effortless property rentals, powered by intelligent automation. Sunvibe uses AI matchmaking, workflow automation, and a 24/7 virtual leasing assistant to make renting seamless.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunvibe.vn",
  locale: "en_US",
  logo: "/images/brand/sunvibe-logo.png",
  contactEmail: CONTACT_EMAIL,
  links: {
    contact: mailto(CONTACT_EMAIL),
    waitlist: mailto(CONTACT_EMAIL, "Sunvibe Early Access Request"),
  },
} as const;
