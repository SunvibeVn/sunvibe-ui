import { describe, expect, it } from "vitest";

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
