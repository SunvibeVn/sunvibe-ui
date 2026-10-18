import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME } from "./routes";

describe("workspace routes", () => {
  it("routes_constants_haveTheSpecValues", () => {
    expect(WORKSPACE_HOME).toBe("/workspace/owner-leads");
    expect([...STAFF_WORKSPACE_ROLES]).toEqual(["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"]);
  });

  it("routes_file_hasNoImports_soServerPagesNeverLoadBrowserSessionModules", () => {
    const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/from\s+["']/);
  });
});
