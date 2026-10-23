import { describe, expect, it } from "vitest";

import { parseListState } from "../lib/list-url-state";
import { viewerOf } from "../lib/viewer";

import { LIST_PATH, leadDetailHref, listHref, assigneeListHref } from "./list-href";

const sale = viewerOf(["SALE"]);
const leader = viewerOf(["SALE_LEADER"]);
const admin = viewerOf(["ADMIN"]);

const stateOf = (query: string, viewer = leader) => parseListState(new URLSearchParams(query), viewer);

describe("listHref (security: a link never leaves the viewer's tabs, W11-23)", () => {
  it("a SALE asking for the all tab and an assignee still gets mine without the assignee", () => {
    const href = listHref(stateOf("scope=mine", sale), { scope: "all", assignee: "U1" }, sale);
    expect(href).toBe(`${LIST_PATH}?scope=mine`);
  });

  it("an ADMIN asking for mine gets the default tab", () => {
    expect(listHref(stateOf("scope=all", admin), { scope: "mine" }, admin)).toBe(`${LIST_PATH}?scope=all`);
  });

  it("a leader keeps the filters of the tab and a change resets the page", () => {
    const state = stateOf("scope=all&ward=20242&page=3");
    expect(listHref(state, { ward: "20243" }, leader)).toBe(`${LIST_PATH}?scope=all&ward=20243`);
  });

  it("leaving the all tab drops its ward and assignee and takes the mine default", () => {
    const state = stateOf("scope=all&ward=20242&assignee=U1&status=REJECTED");
    expect(listHref(state, { scope: "mine" }, leader)).toBe(`${LIST_PATH}?scope=mine`);
  });

  it("All → My → All ends on Unassigned only (W14-26)", () => {
    const mine = stateOf(listHref(stateOf(""), { scope: "mine" }, leader).split("?")[1]);
    expect(listHref(mine, { scope: "all" }, leader)).toBe(`${LIST_PATH}?scope=all`);
    expect(stateOf("scope=all").statuses).toEqual(["NEW"]);
  });

  it("a link without a change goes to the same normalized list; page can be set", () => {
    const state = stateOf("scope=mine&status=CONTACTED&page=2");
    expect(listHref(state, {}, leader, 1)).toBe(`${LIST_PATH}?scope=mine&status=CONTACTED`);
    expect(listHref(state, {}, leader, 4)).toBe(`${LIST_PATH}?scope=mine&status=CONTACTED&page=4`);
  });
});

describe("leadDetailHref", () => {
  it("encodes the id", () => {
    expect(leadDetailHref("01J9Z")).toBe("/workspace/owner-leads/01J9Z");
    expect(leadDetailHref("a/b?c")).toBe("/workspace/owner-leads/a%2Fb%3Fc");
  });
});

describe("assigneeListHref (territories notice and detail assignee link, A-6, W14-28)", () => {
  it("sends an ADMIN to All Leads filtered by the former holder, exactly", () => {
    expect(assigneeListHref("01J9Z3K8M2Q4R5T6V7W8X9Y0ZA", admin)).toBe(
      "/workspace/owner-leads?scope=all&assignee=01J9Z3K8M2Q4R5T6V7W8X9Y0ZA",
    );
  });

  it("opens that person's open leads, never an empty Unassigned list (Review Focus 1)", () => {
    const state = stateOf(assigneeListHref("U1", leader).split("?")[1]);
    expect(state).toEqual({ scope: "all", statuses: ["ASSIGNED", "CONTACTED", "ON_HOLD"], assignee: "U1", page: 1 });
  });

  it("never puts an id that is not a plain id into the URL", () => {
    expect(assigneeListHref("U1&scope=mine", admin)).toBe(`${LIST_PATH}?scope=all`);
    expect(assigneeListHref("", admin)).toBe(`${LIST_PATH}?scope=all`);
  });

  it("gives a viewer without the all tab the default tab without the holder", () => {
    expect(assigneeListHref("U1", sale)).toBe(`${LIST_PATH}?scope=mine`);
  });
});
