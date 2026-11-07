import { describe, expect, it } from "vitest";

import { createListFlash } from "./list-flash";

describe("createListFlash (C-37: one-shot notice for the list, in memory only)", () => {
  it("is taken once by the user it was set for", () => {
    const flash = createListFlash();
    flash.set("U1", "leadNotFound");
    expect(flash.take("U1")).toBe("leadNotFound");
    expect(flash.take("U1")).toBeNull();
  });

  it("is never handed to another user, and is gone after that attempt", () => {
    const flash = createListFlash();
    flash.set("U1", "leadNotFound");
    expect(flash.take("U2")).toBeNull();
    expect(flash.take("U1")).toBeNull();
  });

  it("is dropped when the user changes or signs out", () => {
    const flash = createListFlash();
    flash.set("U1", "leadNotFound");
    flash.resetFor("U2");
    expect(flash.take("U1")).toBeNull();

    flash.set("U1", "leadNotFound");
    flash.resetFor("U1");
    expect(flash.take("U1")).toBe("leadNotFound");

    flash.set("U1", "leadNotFound");
    flash.resetFor(null);
    expect(flash.take("U1")).toBeNull();
  });
});
