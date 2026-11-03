import { describe, expect, it } from "vitest";

import { loadedOutsideWorkspace } from "./document-load";

/** The `performance` of a document whose first load was `url` (no entry: `null`). */
const loadedAt = (url: string | null) => ({
  getEntriesByType: (type: string) => (type === "navigation" && url !== null ? [{ name: url }] : []),
});

describe("loadedOutsideWorkspace (SM-FE-06: the workspace headers come only with a document loaded in it)", () => {
  it("documentLoadedAtAWorkspaceUrl_isInside", () => {
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/workspace/owner-leads?scope=mine"))).toBe(false);
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/workspace"))).toBe(false);
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/workspace/owner-leads/L1#survey"))).toBe(false);
  });

  it("documentLoadedAtAPageOutside_thenNavigatedInside_isOutside", () => {
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/"))).toBe(true);
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/login?next=%2Fworkspace%2Fowner-leads"))).toBe(true);
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/account"))).toBe(true);
  });

  it("aPathThatOnlyStartsWithTheSameLetters_isOutside", () => {
    expect(loadedOutsideWorkspace(loadedAt("http://localhost:3000/workspaces"))).toBe(true);
  });

  it("noNavigationEntry_isNotJudged", () => {
    // Without the entry the page cannot tell; it never reloads on a guess.
    expect(loadedOutsideWorkspace(loadedAt(null))).toBe(false);
    expect(loadedOutsideWorkspace(undefined)).toBe(false);
  });
});
