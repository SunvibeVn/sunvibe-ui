import { describe, expect, it } from "vitest";

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
