import { afterEach, describe, expect, it, vi } from "vitest";

import { siteConfig } from "@/config/site";

import sitemap from "./sitemap";

describe("sitemap (W33 Task G3, [DEL-5] D-AI-2)", () => {
  it("sitemap_listsOnlyPublicRoutes", () => {
    // The indexable public routes, which today is / only: the auth pages are English and sign-up is not open (SV-136),
    // /list-with-us is noindex, and the workspace and account are private.
    expect(sitemap().map((entry) => entry.url)).toEqual([new URL("/", siteConfig.url).href]);
  });

  it("sitemap_neverListsAPrivateRoute (Review Focus 5)", () => {
    for (const { url } of sitemap()) {
      expect(new URL(url).pathname).not.toMatch(/^\/(workspace|account)(\/|$)/);
    }
  });
});

describe("sitemap on another host than www (W35a Task U1, D-10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sitemap_nonProductionSite_isEmpty", async () => {
    // siteConfig reads NEXT_PUBLIC_SITE_URL when it loads, so the sitemap is loaded again.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://test.sunvibe.vn");
    vi.resetModules();
    const { default: testSiteSitemap } = await import("./sitemap");

    expect(testSiteSitemap()).toEqual([]);
  });
});
