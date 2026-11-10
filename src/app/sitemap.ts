import type { MetadataRoute } from "next";
import { isProductionSite } from "@/config/production-site";
import { siteConfig } from "@/config/site";

/**
 * sitemap.xml: the indexable public routes, which today is / only ([DEL-5] D-AI-2, W32/W33 plan Task G3). The auth
 * pages are English and sign-up is not open (SV-136), and /list-with-us is noindex while it is on and a 404 while it is
 * off. A route joins this list when it is indexable. Every host but www is noindex and lists nothing (W35a plan D-10).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionSite(siteConfig.url)) return [];
  return [{ url: new URL("/", siteConfig.url).href }];
}
