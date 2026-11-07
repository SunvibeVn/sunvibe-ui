import { afterEach, describe, expect, it, vi } from "vitest";

/** siteConfig reads NEXT_PUBLIC_SITE_URL when the module loads, so each case loads it again. */
async function loadSiteConfig() {
  vi.resetModules();
  return (await import("./site")).siteConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteConfig.url", () => {
  it("defaultsToTheWwwHost (G2 D-44, SV-024: www.sunvibe.vn serves the pages, the apex redirects to it)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect((await loadSiteConfig()).url).toBe("https://www.sunvibe.vn");
  });

  it("takesNextPublicSiteUrlWhenSet", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.test");
    expect((await loadSiteConfig()).url).toBe("https://preview.example.test");
  });
});
