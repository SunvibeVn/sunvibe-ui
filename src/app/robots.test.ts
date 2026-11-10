import { afterEach, describe, expect, it, vi } from "vitest";

import { siteConfig } from "@/config/site";

import robots from "./robots";

const asList = (value: string | string[] | undefined) => (value === undefined ? [] : [value].flat());

describe("robots (W33 Task G3, S-11)", () => {
  it("robots_disallowsWorkspaceAndAccount", () => {
    const rules = [robots().rules].flat();

    expect(rules).toHaveLength(1);
    expect(rules[0].userAgent).toBe("*");
    expect(asList(rules[0].allow)).toEqual(["/"]);
    expect(asList(rules[0].disallow)).toEqual(["/workspace", "/account"]);
  });

  it("robots_pointsAtTheSitemapOfTheSiteOrigin", () => {
    const result = robots();

    // siteConfig.url defaults to https://www.sunvibe.vn (site.test.ts).
    expect(result.sitemap).toBe(new URL("/sitemap.xml", siteConfig.url).href);
    expect(result.host).toBeUndefined();
  });
});

describe("robots on another host than www (W35a Task U1, D-10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("robots_nonProductionSite_allowsCrawlNoSitemap", async () => {
    // siteConfig reads NEXT_PUBLIC_SITE_URL when it loads, so robots is loaded again. Crawling stays allowed, the
    // workspace and the account included, so that crawlers read the X-Robots-Tag noindex of every answer.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://test.sunvibe.vn");
    vi.resetModules();
    const { default: testSiteRobots } = await import("./robots");

    expect(testSiteRobots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });
});
