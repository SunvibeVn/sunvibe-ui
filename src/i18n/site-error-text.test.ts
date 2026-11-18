import { describe, expect, it } from "vitest";

import en from "./messages/en.json";
import vi from "./messages/vi.json";
import { siteErrorText } from "./site-error-text";

describe("siteErrorText, the texts of the root and global error pages (marketing-landing SV-250)", () => {
  it("siteErrorText_equalsTheMessages", () => {
    expect(siteErrorText("vi")).toEqual(vi.SiteError);
    expect(siteErrorText("en")).toEqual(en.SiteError);
  });
});
