import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroSection } from "./hero-section";
import { SearchHero } from "./search-hero";

const count = (html: string, tag: string) => html.match(new RegExp(`<${tag}[\\s>]`, "g"))?.length ?? 0;

// S-11: / has one <h1>, the search hero's; the hero below it is a section of the page (W33 Task G3).
describe("the headings of /", () => {
  it("heroSection_usesH2NotH1", () => {
    const html = renderToStaticMarkup(createElement(HeroSection));

    expect(count(html, "h1")).toBe(0);
    expect(html).toMatch(/<h2[^>]*>Effortless property rentals,/);
  });

  it("searchHero_keepsTheOneH1", () => {
    expect(count(renderToStaticMarkup(createElement(SearchHero)), "h1")).toBe(1);
  });
});
