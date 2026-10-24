import { describe, expect, it } from "vitest";

import { add, isBusy, remove } from "./command-lock";

describe("command lock (CR-2, Review Focus 5)", () => {
  it("commandLock_surveyAndEntryShareOneLock", () => {
    const busy = add([], "survey");
    // One lock for the page: with a survey command on its way every part is locked, the history "+" included.
    expect(isBusy(busy)).toBe(true);
    expect(isBusy(add(busy, "entry"))).toBe(true);
    expect(isBusy(remove(busy, "survey"))).toBe(false);
  });

  it("adds a source once", () => {
    const once = add([], "survey");
    expect(add(once, "survey")).toBe(once);
    expect(remove(add(add(once, "survey"), "survey"), "survey")).toEqual([]);
  });

  it("keeps the other sources when one ends", () => {
    expect(remove(add(add([], "assign"), "requirement"), "assign")).toEqual(["requirement"]);
    expect(isBusy([])).toBe(false);
  });

  it("returns the same array when nothing changes", () => {
    const sources = add([], "entry");
    expect(remove(sources, "survey")).toBe(sources);
  });

  it("locks the page for every source while a checklist start is on its way (survey-checklist spec 6.1)", () => {
    const busy = add([], "checklist");
    expect(isBusy(busy)).toBe(true);
    expect(isBusy(add(busy, "survey"))).toBe(true);
    expect(isBusy(remove(busy, "checklist"))).toBe(false);
  });
});
