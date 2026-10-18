import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, OPEN_STATUSES } from "../types";
import {
  hasActiveFilter,
  parseListState,
  pickedStatuses,
  serializeListState,
  toApiQuery,
  withFilter,
  type ListState,
} from "./list-url-state";
import { viewerOf } from "./viewer";

const SALE = viewerOf(["SALE"]);
const LEADER = viewerOf(["SALE_LEADER"]);
const ADMIN = viewerOf(["ADMIN"]);

const OPEN = [...OPEN_STATUSES];
const OPEN_AND_CLOSED = [...OPEN_STATUSES, ...CLOSED_STATUSES];

function parse(query: string, viewer = LEADER): ListState {
  return parseListState(new URLSearchParams(query), viewer);
}

describe("parseListState scope (spec 5.3, W11-23, W11-24)", () => {
  it("normalizes SALE url before any call", () => {
    const state = parse("scope=all&assignee=x&ward=20242&status=CONTACTED", SALE);
    expect(state).toEqual({ scope: "mine", statuses: ["CONTACTED"], includeClosed: false, page: 1 });
    const query = toApiQuery(state);
    expect(query.scope).toBe("mine");
    expect(query).not.toHaveProperty("assigneeUserId");
    expect(query).not.toHaveProperty("wardCode");
    expect(query.status).toEqual(["CONTACTED"]);
  });

  it("SALE never leaves mine, whatever the scope says", () => {
    for (const scope of ["all", "unassigned", "ALL", "", "mine%20", "x"]) {
      expect(toApiQuery(parse(`scope=${scope}&assignee=x`, SALE))).toEqual({
        scope: "mine",
        status: OPEN,
        page: 0,
        size: 20,
      });
    }
    expect(parse("scope=all&scope=mine", SALE).scope).toBe("mine");
  });

  it("leader on unassigned sends neither status nor assigneeUserId", () => {
    const query = toApiQuery(parse("scope=unassigned&assignee=x&status=CONTACTED", LEADER));
    expect(query).toEqual({ scope: "unassigned", page: 0, size: 20 });
  });

  it("default tab is unassigned for ALL viewers and mine for OWN viewers", () => {
    expect(parse("", LEADER).scope).toBe("unassigned");
    expect(parse("", ADMIN).scope).toBe("unassigned");
    expect(parse("", SALE).scope).toBe("mine");
  });

  it("ADMIN without a sale role cannot open mine", () => {
    expect(parse("scope=mine", ADMIN).scope).toBe("unassigned");
  });

  it("keeps an allowed scope", () => {
    expect(parse("scope=mine", LEADER).scope).toBe("mine");
    expect(parse("scope=all", LEADER).scope).toBe("all");
    expect(parse("scope=all", ADMIN).scope).toBe("all");
  });
});

describe("parseListState filters (spec 5.3 table, C-26, W11-25)", () => {
  it("defaults to the open statuses", () => {
    expect(parse("scope=mine")).toEqual({ scope: "mine", statuses: OPEN, includeClosed: false, page: 1 });
    expect(toApiQuery(parse("scope=all")).status).toEqual(OPEN);
  });

  it("closed=1 adds the closed statuses", () => {
    expect(parse("scope=all&closed=1")).toMatchObject({ statuses: OPEN_AND_CLOSED, includeClosed: true });
    expect(toApiQuery(parse("scope=mine&closed=1")).status).toEqual(OPEN_AND_CLOSED);
  });

  it("only closed=1 counts", () => {
    for (const closed of ["0", "true", "", "yes"]) {
      expect(parse(`scope=all&closed=${closed}`)).toMatchObject({ statuses: OPEN, includeClosed: false });
    }
  });

  it("status wins over closed", () => {
    expect(parse("scope=all&closed=1&status=NEW")).toMatchObject({ statuses: ["NEW"], includeClosed: false });
  });

  it("keeps W9 statuses in canonical order, without duplicates", () => {
    expect(parse("scope=all&status=WITHDRAWN&status=NEW&status=NEW&status=DUPLICATE").statuses).toEqual([
      "NEW",
      "DUPLICATE",
      "WITHDRAWN",
    ]);
  });

  it("drops statuses outside W9 and falls back to the default when none is left", () => {
    expect(parse("scope=all&status=QUALIFIED&status=ON_HOLD").statuses).toEqual(["ON_HOLD"]);
    expect(parse("scope=all&status=QUALIFIED&status=new&status=").statuses).toEqual(OPEN);
    expect(parse("scope=all&status=VALIDATING&closed=1")).toMatchObject({
      statuses: OPEN_AND_CLOSED,
      includeClosed: true,
    });
  });

  it("drops status and closed on unassigned", () => {
    expect(parse("scope=unassigned&status=CONTACTED&closed=1")).toEqual({
      scope: "unassigned",
      statuses: OPEN,
      includeClosed: false,
      page: 1,
    });
  });

  it("keeps ward and assignee only on all", () => {
    expect(parse("scope=all&ward=20242&assignee=01J9Z3K8M2Q4R5T6V7W8X9Y0ZA")).toMatchObject({
      ward: "20242",
      assignee: "01J9Z3K8M2Q4R5T6V7W8X9Y0ZA",
    });
    for (const scope of ["mine", "unassigned"]) {
      const state = parse(`scope=${scope}&ward=20242&assignee=x`);
      expect(state).not.toHaveProperty("ward");
      expect(state).not.toHaveProperty("assignee");
    }
  });

  it("drops empty or malformed ward and assignee", () => {
    for (const query of ["ward=&assignee=", "ward=%20&assignee=%20", "ward=abc&assignee=a%20b", "ward=1;2"]) {
      const state = parse(`scope=all&${query}`);
      expect(state).not.toHaveProperty("ward");
      expect(state).not.toHaveProperty("assignee");
    }
    expect(parse(`scope=all&assignee=${"A".repeat(27)}`)).not.toHaveProperty("assignee");
  });

  it("reads page 1.. and falls back to 1", () => {
    expect(parse("scope=all&page=3").page).toBe(3);
    for (const page of ["0", "-1", "abc", "", "1.5", "2e3", " 2", "99999999999999999999"]) {
      expect(parse(`scope=all&page=${encodeURIComponent(page)}`).page).toBe(1);
    }
  });
});

describe("toApiQuery (handoff 2)", () => {
  it("sends page - 1 and size 20", () => {
    expect(toApiQuery(parse("scope=all&page=3"))).toMatchObject({ page: 2, size: 20 });
  });

  it("sends ward and assignee on all", () => {
    expect(toApiQuery(parse("scope=all&ward=20242&assignee=x&status=NEW"))).toEqual({
      scope: "all",
      status: ["NEW"],
      wardCode: "20242",
      assigneeUserId: "x",
      page: 0,
      size: 20,
    });
  });

  it("never sends empty values or params the scope does not allow", () => {
    const loose: ListState = {
      scope: "mine",
      statuses: [],
      includeClosed: false,
      ward: "20242",
      assignee: "x",
      page: 0,
    };
    expect(toApiQuery(loose)).toEqual({ scope: "mine", status: OPEN, page: 0, size: 20 });
    expect(toApiQuery({ ...loose, scope: "all", ward: "", assignee: " " })).toEqual({
      scope: "all",
      status: OPEN,
      page: 0,
      size: 20,
    });
    expect(toApiQuery({ ...loose, scope: "unassigned", statuses: ["DUPLICATE"] })).toEqual({
      scope: "unassigned",
      page: 0,
      size: 20,
    });
  });
});

describe("serializeListState and withFilter (W11-24)", () => {
  const samples: ListState[] = [
    { scope: "unassigned", statuses: OPEN, includeClosed: false, page: 1 },
    { scope: "mine", statuses: OPEN, includeClosed: false, page: 4 },
    { scope: "mine", statuses: OPEN_AND_CLOSED, includeClosed: true, page: 1 },
    { scope: "all", statuses: ["NEW", "WITHDRAWN"], includeClosed: false, ward: "20242", assignee: "x", page: 2 },
    { scope: "all", statuses: OPEN_AND_CLOSED, includeClosed: false, page: 1 },
  ];

  it("round trips: parse(serialize(s)) equals s", () => {
    for (const state of samples) {
      expect(parse(serializeListState(state), LEADER)).toEqual(state);
    }
  });

  it("is idempotent on any parsed url", () => {
    for (const query of [
      "scope=all&closed=1&status=NEW&ward=20242&page=7",
      "scope=all&assignee=x&page=abc",
      "scope=unassigned&status=CONTACTED&ward=20242",
      "status=REJECTED&status=NEW",
      "",
    ]) {
      for (const viewer of [SALE, LEADER, ADMIN]) {
        const state = parse(query, viewer);
        expect(parse(serializeListState(state), viewer)).toEqual(state);
      }
    }
  });

  it("keeps the url short: no default statuses, no page 1", () => {
    expect(serializeListState(samples[0])).toBe("scope=unassigned");
    expect(serializeListState(samples[2])).toBe("scope=mine&closed=1");
    expect(serializeListState(samples[3])).toBe("scope=all&status=NEW&status=WITHDRAWN&ward=20242&assignee=x&page=2");
  });

  it("resets page to 1 on any filter or tab change", () => {
    const state = parse("scope=all&page=5&ward=20242");
    expect(withFilter(state, { ward: "20243" })).toMatchObject({ ward: "20243", page: 1 });
    expect(withFilter(state, { scope: "mine" }).page).toBe(1);
    expect(withFilter(state, { includeClosed: true }).page).toBe(1);
  });

  it("drops filters the new tab does not keep", () => {
    const state = parse("scope=all&ward=20242&assignee=x&status=NEW");
    expect(withFilter(state, { scope: "mine" })).toEqual({
      scope: "mine",
      statuses: ["NEW"],
      includeClosed: false,
      page: 1,
    });
    expect(withFilter(state, { scope: "unassigned" })).toEqual({
      scope: "unassigned",
      statuses: OPEN,
      includeClosed: false,
      page: 1,
    });
  });

  it("clears a filter set to undefined or empty", () => {
    const state = parse("scope=all&ward=20242&assignee=x");
    const cleared = withFilter(state, { ward: undefined, assignee: "" });
    expect(cleared).not.toHaveProperty("ward");
    expect(cleared).not.toHaveProperty("assignee");
  });

  it("closed toggle resets the statuses; picking statuses clears closed", () => {
    const picked = withFilter(parse("scope=all"), { statuses: ["REJECTED", "NEW"] });
    expect(picked).toMatchObject({ statuses: ["NEW", "REJECTED"], includeClosed: false });
    expect(withFilter(picked, { includeClosed: true })).toMatchObject({
      statuses: OPEN_AND_CLOSED,
      includeClosed: true,
    });
    expect(withFilter(picked, { statuses: [] })).toMatchObject({ statuses: OPEN, includeClosed: false });
  });

  it("results round trip", () => {
    const base = parse("scope=all&ward=20242&page=3");
    for (const change of [
      { statuses: ["WITHDRAWN" as const, "ASSIGNED" as const] },
      { includeClosed: true },
      { scope: "mine" as const },
      { scope: "unassigned" as const },
      { assignee: "x" },
    ]) {
      const next = withFilter(base, change);
      expect(parse(serializeListState(next))).toEqual(next);
    }
  });

  it("does not mutate its input", () => {
    const state = parse("scope=all&ward=20242&page=3");
    const copy = structuredClone(state);
    withFilter(state, { scope: "mine", statuses: ["NEW"] });
    expect(state).toEqual(copy);
  });
});

describe("pickedStatuses and hasActiveFilter (status chips, 'Xóa bộ lọc')", () => {
  const leader = viewerOf(["SALE_LEADER"]);
  const read = (query: string) => parseListState(new URLSearchParams(query), leader);

  it("is empty for the default open set and for open + closed", () => {
    expect(pickedStatuses(read("scope=mine"))).toEqual([]);
    expect(pickedStatuses(read("scope=mine&closed=1"))).toEqual([]);
    expect(hasActiveFilter(read("scope=mine"))).toBe(false);
  });

  it("returns an explicit pick, even one that lists all seven statuses without 'closed'", () => {
    expect(pickedStatuses(read("scope=mine&status=CONTACTED&status=ON_HOLD"))).toEqual(["CONTACTED", "ON_HOLD"]);
    const all = withFilter(read("scope=mine"), { statuses: [...OPEN_STATUSES, ...CLOSED_STATUSES] });
    expect(all.includeClosed).toBe(false);
    expect(pickedStatuses(all)).toEqual([...OPEN_STATUSES, ...CLOSED_STATUSES]);
    expect(hasActiveFilter(all)).toBe(true);
  });

  it("is active for closed, ward, assignee and a status pick", () => {
    expect(hasActiveFilter(read("scope=mine&closed=1"))).toBe(true);
    expect(hasActiveFilter(read("scope=all&ward=20242"))).toBe(true);
    expect(hasActiveFilter(read("scope=all&assignee=U1"))).toBe(true);
    expect(hasActiveFilter(read("scope=mine&status=NEW"))).toBe(true);
  });
});
