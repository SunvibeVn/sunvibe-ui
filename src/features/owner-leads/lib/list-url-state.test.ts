import { describe, expect, it } from "vitest";

import { assigneeListHref } from "../components/list-href";
import { LEAD_STATUSES } from "../types";
import {
  clearFilters,
  closedToggle,
  defaultStatuses,
  hasActiveFilter,
  parseListState,
  serializeListState,
  statusBoxes,
  toApiQuery,
  toggleClosed,
  withFilter,
  type ListState,
} from "./list-url-state";
import { viewerOf } from "./viewer";

const leader = viewerOf(["SALE_LEADER"]);
const manager = viewerOf(["SALES_MANAGER"]);
const admin = viewerOf(["ADMIN"]);
const sale = viewerOf(["SALE"]);

const q = (s: string) => new URLSearchParams(s);

const OPEN_ON_MINE = ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"];
const WITH_CLOSED = ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"];

describe("list URL state: plan B3 cases (spec 5.3, A-6..A-8)", () => {
  it("defaults per viewer", () => {
    expect(parseListState(q(""), leader)).toEqual({ scope: "all", statuses: ["NEW"], page: 1 });
    expect(parseListState(q(""), sale)).toEqual({ scope: "mine", statuses: ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"], page: 1 });
    expect(viewerOf(["ADMIN"]).tabs).toEqual(["all"]);
    expect(viewerOf(["SALES_MANAGER"]).defaultScope).toBe("all");
    expect(leader.tabs).toEqual(["mine", "all"]);
  });

  it("parse table", () => {
    expect(parseListState(q("scope=unassigned&status=CONTACTED&assignee=U1&ward=20242"), leader))
      .toEqual({ scope: "all", statuses: ["NEW"], ward: "20242", page: 1 });
    expect(parseListState(q("scope=unassigned"), sale).scope).toBe("mine");
    expect(parseListState(q("scope=all&closed=1"), leader).statuses).toEqual(LEAD_STATUSES);
    expect(parseListState(q("scope=all&closed=1&assignee=U1"), leader).statuses)
      .toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
    expect(parseListState(q("scope=mine&closed=1"), leader).statuses)
      .toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
    expect(parseListState(q("scope=all&closed=1&status=ON_HOLD"), leader).statuses).toEqual(["ON_HOLD"]);
    expect(parseListState(q("scope=mine&status=NEW"), leader).statuses).toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]);
  });

  it("assignee link without status gets the assignee default", () => {
    expect(parseListState(q("scope=all&assignee=U1"), leader).statuses).toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]);
    expect(parseListState(q(assigneeListHref("U1", leader).split("?")[1]), leader).statuses)
      .toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]);
  });

  it("assignee set and cleared", () => {
    const def = parseListState(q(""), leader);
    expect(withFilter(def, { assignee: "U1" }).statuses).toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]);
    const picked = withFilter(def, { statuses: ["NEW", "DUPLICATE"] });
    expect(withFilter(picked, { assignee: "U1" }).statuses).toEqual(["DUPLICATE"]);
    const withA = withFilter(def, { assignee: "U1" });
    expect(withFilter(withA, { assignee: null }).statuses).toEqual(["NEW"]);
  });

  it("tab switch resets", () => {
    const s = withFilter(parseListState(q(""), leader), { statuses: ["ASSIGNED"], ward: "20242" });
    const mine = withFilter(s, { scope: "mine" });
    expect(mine).toEqual({ scope: "mine", statuses: ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"], page: 1 });
    expect(withFilter(mine, { scope: "all" }).statuses).toEqual(["NEW"]);
  });

  it("empty set, clear filters, show closed", () => {
    const def = parseListState(q(""), leader);
    expect(withFilter(def, { statuses: [] }).statuses).toEqual(["NEW"]);
    expect(clearFilters(withFilter(def, { assignee: "U1", ward: "20242" }))).toEqual(def);
    const mine = parseListState(q(""), sale);
    expect(closedToggle(mine)).toBe("unchecked");
    expect(toggleClosed(mine).statuses).toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
    const mixed = withFilter(mine, { statuses: ["ASSIGNED", "REJECTED"] });
    expect(closedToggle(mixed)).toBe("mixed");
    expect(toggleClosed(mixed).statuses).toEqual(["ASSIGNED", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
    const closedOnly = withFilter(mine, { statuses: ["DUPLICATE", "REJECTED", "WITHDRAWN"] });
    expect(toggleClosed(closedOnly).statuses).toEqual(["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"]); // empty → default
  });

  it("serialize and api query", () => {
    expect(serializeListState(parseListState(q(""), leader))).toBe("scope=all");
    expect(toApiQuery(parseListState(q(""), leader))).toEqual({ scope: "all", status: ["NEW"], page: 0, size: 20 });
    expect(serializeListState(parseListState(q("scope=all&closed=1"), leader))).not.toContain("closed");
  });

  it("SALE never leaves mine (W11-23)", () => {
    const s = parseListState(q("scope=all&assignee=U1&ward=20242"), sale);
    expect(toApiQuery(s)).toEqual({ scope: "mine", status: ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "ON_HOLD"], page: 0, size: 20 });
  });
});

describe("statusBoxes and defaultStatuses (spec 5.3 table, C-45)", () => {
  it("My Leads shows every status but Unassigned", () => {
    expect(statusBoxes("mine")).toEqual(WITH_CLOSED);
    expect(statusBoxes("mine", "U1")).toEqual(WITH_CLOSED);
    expect(defaultStatuses("mine")).toEqual(OPEN_ON_MINE);
  });

  it("All Leads shows all eight without an assignee, and drops Unassigned with one", () => {
    expect(statusBoxes("all")).toEqual(LEAD_STATUSES);
    expect(statusBoxes("all")).toEqual(["NEW", ...WITH_CLOSED]);
    expect(defaultStatuses("all")).toEqual(["NEW"]);
    expect(statusBoxes("all", "U1")).toEqual(WITH_CLOSED);
    expect(defaultStatuses("all", "U1")).toEqual(OPEN_ON_MINE);
  });

  it("keeps Survey Scheduled from the URL on both tabs (C-3d)", () => {
    expect(parseListState(q("scope=mine&status=SURVEY_SCHEDULED"), sale).statuses).toEqual(["SURVEY_SCHEDULED"]);
    expect(parseListState(q("scope=all&status=SURVEY_SCHEDULED"), leader).statuses).toEqual(["SURVEY_SCHEDULED"]);
  });

  it("returns fresh arrays", () => {
    defaultStatuses("all").push("ASSIGNED");
    expect(defaultStatuses("all")).toEqual(["NEW"]);
  });
});

describe("parseListState: scope and the SALE rules (W11-23, W14-25, W14-29)", () => {
  it("SALE never leaves mine, whatever the scope says", () => {
    for (const scope of ["all", "unassigned", "ALL", "", "mine%20", "x"]) {
      expect(toApiQuery(parseListState(q(`scope=${scope}&assignee=x&ward=20242`), sale))).toEqual({
        scope: "mine",
        status: OPEN_ON_MINE,
        page: 0,
        size: 20,
      });
    }
    expect(parseListState(q("scope=all&scope=mine"), sale).scope).toBe("mine");
  });

  it("a SALE on the old unassigned url gets its default, not the url's statuses", () => {
    expect(parseListState(q("scope=unassigned&status=CONTACTED"), sale)).toEqual({
      scope: "mine",
      statuses: OPEN_ON_MINE,
      page: 1,
    });
  });

  it("a SALE keeps an explicit pick, also from a url naming another tab (W11-23)", () => {
    expect(parseListState(q("scope=mine&status=CONTACTED"), sale).statuses).toEqual(["CONTACTED"]);
    expect(parseListState(q("scope=all&assignee=x&ward=20242&status=CONTACTED"), sale)).toEqual({
      scope: "mine",
      statuses: ["CONTACTED"],
      page: 1,
    });
  });

  it("ADMIN and SALES_MANAGER without a sale role cannot open mine", () => {
    expect(parseListState(q("scope=mine"), admin)).toEqual({ scope: "all", statuses: ["NEW"], page: 1 });
    expect(parseListState(q("scope=mine"), manager).scope).toBe("all");
  });

  it("SALES_MANAGER lands on All Leads with only Unassigned (W14-25)", () => {
    expect(toApiQuery(parseListState(q(""), manager))).toEqual({ scope: "all", status: ["NEW"], page: 0, size: 20 });
  });

  it("the old unassigned url keeps the ward and the page", () => {
    expect(parseListState(q("scope=unassigned&ward=20242&page=2"), admin)).toEqual({
      scope: "all",
      statuses: ["NEW"],
      ward: "20242",
      page: 2,
    });
  });
});

describe("parseListState: statuses and filters", () => {
  it("keeps W9 statuses in canonical order, without duplicates", () => {
    expect(parseListState(q("scope=all&status=WITHDRAWN&status=NEW&status=NEW&status=DUPLICATE"), leader).statuses)
      .toEqual(["NEW", "DUPLICATE", "WITHDRAWN"]);
  });

  it("drops statuses outside W9 and falls back to the default when none is left", () => {
    expect(parseListState(q("scope=all&status=QUALIFIED&status=ON_HOLD"), leader).statuses).toEqual(["ON_HOLD"]);
    expect(parseListState(q("scope=all&status=QUALIFIED&status=new&status="), leader).statuses).toEqual(["NEW"]);
  });

  it("drops Unassigned with an assignee; a set that becomes empty is the assignee default", () => {
    expect(parseListState(q("scope=all&assignee=U1&status=NEW&status=REJECTED"), leader).statuses).toEqual(["REJECTED"]);
    expect(parseListState(q("scope=all&assignee=U1&status=NEW"), leader).statuses).toEqual(OPEN_ON_MINE);
  });

  it("only closed=1 counts, and closed applies only when no status survives", () => {
    for (const closed of ["0", "true", "", "yes"]) {
      expect(parseListState(q(`scope=all&closed=${closed}`), leader).statuses).toEqual(["NEW"]);
    }
    expect(parseListState(q("scope=all&status=VALIDATING&closed=1"), leader).statuses).toEqual(LEAD_STATUSES);
    expect(parseListState(q("scope=mine&status=NEW&closed=1"), leader).statuses).toEqual(WITH_CLOSED);
  });

  it("keeps ward and assignee only on all", () => {
    expect(parseListState(q("scope=all&ward=20242&assignee=01J9Z3K8M2Q4R5T6V7W8X9Y0ZA"), leader)).toMatchObject({
      ward: "20242",
      assignee: "01J9Z3K8M2Q4R5T6V7W8X9Y0ZA",
    });
    const mine = parseListState(q("scope=mine&ward=20242&assignee=x"), leader);
    expect(mine).not.toHaveProperty("ward");
    expect(mine).not.toHaveProperty("assignee");
  });

  it("drops empty or malformed ward and assignee", () => {
    for (const query of ["ward=&assignee=", "ward=%20&assignee=%20", "ward=abc&assignee=a%20b", "ward=1;2"]) {
      const state = parseListState(q(`scope=all&${query}`), leader);
      expect(state).not.toHaveProperty("ward");
      expect(state).not.toHaveProperty("assignee");
      expect(state.statuses).toEqual(["NEW"]);
    }
    expect(parseListState(q(`scope=all&assignee=${"A".repeat(27)}`), leader)).not.toHaveProperty("assignee");
  });

  it("reads page 1.. and falls back to 1", () => {
    expect(parseListState(q("scope=all&page=3"), leader).page).toBe(3);
    for (const page of ["0", "-1", "abc", "", "1.5", "2e3", " 2", "99999999999999999999"]) {
      expect(parseListState(q(`scope=all&page=${encodeURIComponent(page)}`), leader).page).toBe(1);
    }
  });
});

describe("toApiQuery (scope and the full status set always sent)", () => {
  it("sends page - 1, size 20, ward and assignee on all", () => {
    expect(toApiQuery(parseListState(q("scope=all&ward=20242&assignee=x&page=3"), leader))).toEqual({
      scope: "all",
      status: OPEN_ON_MINE,
      wardCode: "20242",
      assigneeUserId: "x",
      page: 2,
      size: 20,
    });
  });

  it("never sends empty values, Unassigned with an assignee, or params the scope does not allow", () => {
    const loose: ListState = { scope: "mine", statuses: [], ward: "20242", assignee: "x", page: 0 };
    expect(toApiQuery(loose)).toEqual({ scope: "mine", status: OPEN_ON_MINE, page: 0, size: 20 });
    expect(toApiQuery({ ...loose, scope: "all", ward: "", assignee: " " })).toEqual({
      scope: "all",
      status: ["NEW"],
      page: 0,
      size: 20,
    });
    expect(toApiQuery({ ...loose, scope: "all", statuses: ["NEW", "DUPLICATE"] })).toMatchObject({
      status: ["DUPLICATE"],
      assigneeUserId: "x",
    });
  });
});

describe("serializeListState (never writes closed; leaves out the default set and page 1)", () => {
  const samples: ListState[] = [
    { scope: "all", statuses: ["NEW"], page: 1 },
    { scope: "mine", statuses: OPEN_ON_MINE as ListState["statuses"], page: 4 },
    { scope: "mine", statuses: WITH_CLOSED as ListState["statuses"], page: 1 },
    { scope: "all", statuses: ["NEW", "WITHDRAWN"], ward: "20242", page: 2 },
    { scope: "all", statuses: OPEN_ON_MINE as ListState["statuses"], assignee: "x", page: 1 },
    { scope: "all", statuses: ["DUPLICATE"], assignee: "x", page: 1 },
    { scope: "all", statuses: [...LEAD_STATUSES], page: 1 },
  ];

  it("round trips: parse(serialize(s)) equals s", () => {
    for (const state of samples) {
      expect(parseListState(q(serializeListState(state)), leader)).toEqual(state);
    }
  });

  it("is idempotent on any parsed url", () => {
    for (const query of [
      "scope=all&closed=1&status=NEW&ward=20242&page=7",
      "scope=all&assignee=x&page=abc",
      "scope=unassigned&status=CONTACTED&ward=20242",
      "scope=mine&closed=1",
      "status=REJECTED&status=NEW",
      "",
    ]) {
      for (const viewer of [sale, leader, admin]) {
        const state = parseListState(q(query), viewer);
        expect(parseListState(q(serializeListState(state)), viewer)).toEqual(state);
      }
    }
  });

  it("keeps the url short", () => {
    expect(serializeListState(samples[1])).toBe("scope=mine&page=4");
    expect(serializeListState(samples[2])).toBe(
      "scope=mine&status=ASSIGNED&status=CONTACTED&status=SURVEY_SCHEDULED&status=ON_HOLD&status=DUPLICATE&status=REJECTED" +
        "&status=WITHDRAWN",
    );
    expect(serializeListState(samples[3])).toBe("scope=all&status=NEW&status=WITHDRAWN&ward=20242&page=2");
    expect(serializeListState(samples[4])).toBe("scope=all&assignee=x");
  });
});

describe("withFilter (spec 5.3 rules)", () => {
  const def = parseListState(q(""), leader);

  it("resets page to 1 on any filter or tab change", () => {
    const state = parseListState(q("scope=all&page=5&ward=20242"), leader);
    expect(withFilter(state, { ward: "20243" })).toMatchObject({ ward: "20243", page: 1 });
    expect(withFilter(state, { scope: "mine" }).page).toBe(1);
    expect(withFilter(state, { statuses: ["ASSIGNED"] }).page).toBe(1);
  });

  it("a tab switch drops ward and assignee and takes the target default", () => {
    const state = parseListState(q("scope=all&ward=20242&assignee=x&status=REJECTED"), leader);
    expect(withFilter(state, { scope: "mine" })).toEqual({ scope: "mine", statuses: OPEN_ON_MINE, page: 1 });
  });

  it("the same tab is not a switch", () => {
    const state = parseListState(q("scope=all&ward=20242&status=REJECTED"), leader);
    expect(withFilter(state, { scope: "all" })).toEqual({ ...state, page: 1 });
  });

  it("null clears a filter; undefined leaves it", () => {
    const state = parseListState(q("scope=all&ward=20242&assignee=x"), leader);
    expect(withFilter(state, { ward: undefined })).toMatchObject({ ward: "20242", assignee: "x" });
    const cleared = withFilter(state, { ward: null, assignee: null });
    expect(cleared).not.toHaveProperty("ward");
    expect(cleared).not.toHaveProperty("assignee");
    expect(cleared.statuses).toEqual(["NEW"]);
  });

  it("an assignee that is not a plain id clears it", () => {
    const withA = withFilter(def, { assignee: "U1" });
    for (const bad of ["", " ", "U1&scope=mine"]) {
      const next = withFilter(withA, { assignee: bad });
      expect(next).not.toHaveProperty("assignee");
      expect(next.statuses).toEqual(["NEW"]);
    }
    expect(withFilter(def, { assignee: "U1&x" })).toEqual(def);
  });

  it("a picked set is kept when the assignee is cleared or changed", () => {
    const picked = withFilter(withFilter(def, { assignee: "U1" }), { statuses: ["REJECTED"] });
    expect(withFilter(picked, { assignee: null }).statuses).toEqual(["REJECTED"]);
    expect(withFilter(picked, { assignee: "U2" }).statuses).toEqual(["REJECTED"]);
    expect(withFilter(withFilter(def, { assignee: "U1" }), { assignee: "U2" }).statuses).toEqual(OPEN_ON_MINE);
  });

  it("an assignee on mine is ignored", () => {
    const mine = parseListState(q("scope=mine"), leader);
    expect(withFilter(mine, { assignee: "U1" })).toEqual(mine);
  });

  it("drops a status the tab does not show", () => {
    expect(withFilter(parseListState(q("scope=mine"), leader), { statuses: ["NEW", "REJECTED"] }).statuses).toEqual([
      "REJECTED",
    ]);
  });

  it("does not mutate its input", () => {
    const state = parseListState(q("scope=all&ward=20242&page=3"), leader);
    const copy = structuredClone(state);
    withFilter(state, { scope: "mine", statuses: ["NEW"] });
    withFilter(state, { assignee: "U1" });
    expect(state).toEqual(copy);
  });

  it("results round trip", () => {
    const base = parseListState(q("scope=all&ward=20242&page=3"), leader);
    for (const change of [
      { statuses: ["WITHDRAWN" as const, "ASSIGNED" as const] },
      { scope: "mine" as const },
      { assignee: "x" },
      { assignee: "x", statuses: ["NEW" as const] },
      { ward: null },
    ]) {
      const next = withFilter(base, change);
      expect(parseListState(q(serializeListState(next)), leader)).toEqual(next);
    }
  });
});

describe("closedToggle and toggleClosed (A-8)", () => {
  const all = parseListState(q(""), leader);

  it("is checked with all three closed ticked", () => {
    const checked = toggleClosed(all);
    expect(checked.statuses).toEqual(LEAD_STATUSES.filter((s) => s === "NEW" || WITH_CLOSED.slice(4).includes(s)));
    expect(closedToggle(checked)).toBe("checked");
    expect(toggleClosed(checked)).toEqual({ ...all, page: 1 });
  });

  it("resets the page", () => {
    expect(toggleClosed({ ...all, page: 4 }).page).toBe(1);
  });
});

describe("clearFilters and hasActiveFilter", () => {
  it("clears to the tab default, keeping the tab", () => {
    const mine = parseListState(q("scope=mine&status=REJECTED&page=3"), leader);
    expect(clearFilters(mine)).toEqual({ scope: "mine", statuses: OPEN_ON_MINE, page: 1 });
  });

  it("is inactive on the default and active for a pick, ward or assignee", () => {
    expect(hasActiveFilter(parseListState(q(""), leader))).toBe(false);
    expect(hasActiveFilter(parseListState(q("scope=mine"), leader))).toBe(false);
    expect(hasActiveFilter(parseListState(q("scope=mine&closed=1"), leader))).toBe(true);
    expect(hasActiveFilter(parseListState(q("scope=all&ward=20242"), leader))).toBe(true);
    expect(hasActiveFilter(parseListState(q("scope=all&assignee=U1"), leader))).toBe(true);
    expect(hasActiveFilter(parseListState(q("scope=all&status=ASSIGNED"), leader))).toBe(true);
  });
});
