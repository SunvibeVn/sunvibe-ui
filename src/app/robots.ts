import type { MetadataRoute } from "next";
import { isProductionSite } from "@/config/production-site";
import { siteConfig } from "@/config/site";

/**
 * robots.txt (S-11): crawlers keep out of the staff workspace and the account pages; both need a session anyway.
 * Every host but www (W35a plan D-10) allows all and names no sitemap: its answers carry X-Robots-Tag noindex
 * (security-headers.ts), which a crawler reads only where it may crawl.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite(siteConfig.url)) return { rules: { userAgent: "*", allow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/workspace", "/account"] },
    sitemap: new URL("/sitemap.xml", siteConfig.url).href,
  };
}
