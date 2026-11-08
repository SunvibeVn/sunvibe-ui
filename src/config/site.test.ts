import { afterEach, describe, expect, it, vi } from "vitest";

/** siteConfig reads NEXT_PUBLIC_SITE_URL when the module loads, so each case loads it again. */
async function loadSiteConfig() {
  vi.resetModules();
  return (await import("./site")).siteConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteConfig title, description and locale", () => {
  // [DEL-5] D-AI-1 (W32/W33 plan, Task G3, Claude, 2026-11-07): the field and the audience only; no capability, city,
  // price or legal status (SV-011, SV-180). Interim until the marketing-launch brief replaces it.
  it("titleDescriptionLocale_areTheVietnameseValuesOfDAi1", async () => {
    const site = await loadSiteConfig();
    expect(site.title).toBe("Sunvibe | Thuê và cho thuê bất động sản");
    expect(site.description).toBe(
      "Sunvibe dành cho chủ nhà muốn cho thuê bất động sản và người đang tìm nơi để thuê.",
    );
    expect(site.locale).toBe("vi_VN");
  });
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
