import { describe, expect, it } from "vitest";

import { viewerOf } from "./viewer";

describe("viewerOf (spec 5.3, C-38, W11-24)", () => {
  it("SALE sees only its own leads", () => {
    expect(viewerOf(["SALE"])).toEqual({
      access: "OWN",
      canHoldLeads: true,
      isAdmin: false,
      tabs: ["mine"],
      defaultScope: "mine",
    });
  });

  it("SALE_LEADER sees every tab and starts on unassigned", () => {
    expect(viewerOf(["SALE_LEADER"])).toEqual({
      access: "ALL",
      canHoldLeads: true,
      isAdmin: false,
      tabs: ["mine", "unassigned", "all"],
      defaultScope: "unassigned",
    });
  });

  it("ADMIN without a sale role has no mine tab (C-38)", () => {
    expect(viewerOf(["ADMIN"])).toEqual({
      access: "ALL",
      canHoldLeads: false,
      isAdmin: true,
      tabs: ["unassigned", "all"],
      defaultScope: "unassigned",
    });
  });

  it("SUPER_ADMIN counts as ADMIN", () => {
    expect(viewerOf(["SUPER_ADMIN"])).toEqual(viewerOf(["ADMIN"]));
  });

  it("SALES_MANAGER alone has no mine tab", () => {
    expect(viewerOf(["SALES_MANAGER"])).toMatchObject({
      access: "ALL",
      canHoldLeads: false,
      isAdmin: false,
      tabs: ["unassigned", "all"],
      defaultScope: "unassigned",
    });
  });

  it("SALES_MANAGER + SALE sees every tab", () => {
    expect(viewerOf(["SALES_MANAGER", "SALE"])).toMatchObject({
      access: "ALL",
      canHoldLeads: true,
      tabs: ["mine", "unassigned", "all"],
      defaultScope: "unassigned",
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
    expect(viewerOf(["SALE_LEADER"]).tabs).toEqual(["mine", "unassigned", "all"]);
  });
});
