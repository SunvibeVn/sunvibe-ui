import { describe, expect, it } from "vitest";

import { viewerOf } from "./viewer";

describe("viewerOf (spec 5.3, C-38, C-44, W14-25)", () => {
  it("SALE sees only its own leads", () => {
    expect(viewerOf(["SALE"])).toEqual({
      access: "OWN",
      canHoldLeads: true,
      isAdmin: false,
      tabs: ["mine"],
      defaultScope: "mine",
    });
  });

  it("SALE_LEADER has both tabs and starts on All Leads (C-44)", () => {
    expect(viewerOf(["SALE_LEADER"])).toEqual({
      access: "ALL",
      canHoldLeads: true,
      isAdmin: false,
      tabs: ["mine", "all"],
      defaultScope: "all",
    });
  });

  it("ADMIN without a sale role has only All Leads (C-38)", () => {
    expect(viewerOf(["ADMIN"])).toEqual({
      access: "ALL",
      canHoldLeads: false,
      isAdmin: true,
      tabs: ["all"],
      defaultScope: "all",
    });
  });

  it("SUPER_ADMIN counts as ADMIN", () => {
    expect(viewerOf(["SUPER_ADMIN"])).toEqual(viewerOf(["ADMIN"]));
  });

  it("SALES_MANAGER alone has only All Leads", () => {
    expect(viewerOf(["SALES_MANAGER"])).toMatchObject({
      access: "ALL",
      canHoldLeads: false,
      isAdmin: false,
      tabs: ["all"],
      defaultScope: "all",
    });
  });

  it("SALES_MANAGER + SALE has both tabs", () => {
    expect(viewerOf(["SALES_MANAGER", "SALE"])).toMatchObject({
      access: "ALL",
      canHoldLeads: true,
      tabs: ["mine", "all"],
      defaultScope: "all",
    });
  });

  it("a user without a workspace role gets the narrowest view", () => {
    expect(viewerOf(["CUSTOMER"])).toEqual({
      access: "OWN",
      canHoldLeads: false,
      isAdmin: false,
      tabs: ["mine"],
      defaultScope: "mine",
    });
    expect(viewerOf([])).toEqual(viewerOf(["CUSTOMER"]));
  });

  it("returns a fresh tabs array on every call", () => {
    const first = viewerOf(["SALE_LEADER"]);
    first.tabs.pop();
    expect(viewerOf(["SALE_LEADER"]).tabs).toEqual(["mine", "all"]);
  });
});
