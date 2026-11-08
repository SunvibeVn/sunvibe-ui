import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/** robots.txt (S-11): crawlers keep out of the staff workspace and the account pages; both need a session anyway. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/workspace", "/account"] },
    sitemap: new URL("/sitemap.xml", siteConfig.url).href,
  };
}
