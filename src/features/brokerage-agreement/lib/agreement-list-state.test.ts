import { describe, expect, it } from "vitest";

import {
  AGREEMENT_LIST_PAGE_SIZE,
  AGREEMENT_STATUSES,
  parseAgreementListState,
  serializeAgreementListState,
  toAgreementListQuery,
  withAgreementFilter,
} from "./agreement-list-state";

const parse = (query: string) => parseAgreementListState(new URLSearchParams(query));

describe("agreement list address (brokerage-agreement E05-S7, spec section 6, UL-3)", () => {
  it("agreementListState_address_parsedAndSerialized: status, ending and page are read from the address and written back in that order", () => {
    expect(parse("")).toEqual({ ending: false, page: 1 });
    expect(parse("status=ACTIVE&ending=1&page=3")).toEqual({ status: "ACTIVE", ending: true, page: 3 });
    expect(parse("page=10000")).toEqual({ ending: false, page: 10000 });
    expect(parse("status=CANCELLED")).toEqual({ status: "CANCELLED", ending: false, page: 1 });

    expect(serializeAgreementListState({ ending: false, page: 1 })).toBe("");
    expect(serializeAgreementListState({ status: "ACTIVE", ending: true, page: 3 })).toBe("status=ACTIVE&ending=1&page=3");
    expect(serializeAgreementListState({ ending: true, page: 1 })).toBe("ending=1");
    expect(serializeAgreementListState({ status: "SUSPENDED", ending: false, page: 2 })).toBe("status=SUSPENDED&page=2");
    for (const status of AGREEMENT_STATUSES) {
      expect(parse(serializeAgreementListState({ status, ending: false, page: 1 }))).toEqual({ status, ending: false, page: 1 });
    }
  });

  it("agreementListState_unknownValues_normalized: a status that is not exactly one of the seven codes is dropped, ending reads only 1, a page that is not 1 to 10000 reads 1", () => {
    expect(parse("status=active")).toEqual({ ending: false, page: 1 });
    expect(parse("status=%20ACTIVE")).toEqual({ ending: false, page: 1 });
    expect(parse("status=ACTIVE,SUSPENDED")).toEqual({ ending: false, page: 1 });
    expect(parse("status=")).toEqual({ ending: false, page: 1 });
    expect(parse("status=OTHER")).toEqual({ ending: false, page: 1 });
    expect(parse("status=toString")).toEqual({ ending: false, page: 1 });
    expect(parse("ending=true")).toEqual({ ending: false, page: 1 });
    expect(parse("ending=0")).toEqual({ ending: false, page: 1 });
    for (const page of ["0", "-1", "x", "10001", "01", "1.5", "1e3", "", "99999999999"]) {
      expect(parse(`page=${page}`)).toEqual({ ending: false, page: 1 });
    }
    // Every address reads back as itself once normalized, so the list asks the API only for a query it accepts.
    expect(serializeAgreementListState(parse("status=active&ending=true&page=x"))).toBe("");
  });

  it("agreementListState_filterChange_pageOne: a change of state or of the ending filter goes to page 1; null clears the state", () => {
    const state = { status: "ACTIVE" as const, ending: false, page: 4 };

    expect(withAgreementFilter(state, { ending: true })).toEqual({ status: "ACTIVE", ending: true, page: 1 });
    expect(withAgreementFilter(state, { status: "SUSPENDED" })).toEqual({ status: "SUSPENDED", ending: false, page: 1 });
    expect(withAgreementFilter(state, { status: null })).toEqual({ ending: false, page: 1 });
    expect(withAgreementFilter({ ending: true, page: 2 }, { ending: false })).toEqual({ ending: false, page: 1 });
  });

  it("agreementListState_apiQuery_zeroBasedPageSize20: the API query is the address's, with a zero-based page and size 20", () => {
    expect(AGREEMENT_LIST_PAGE_SIZE).toBe(20);
    expect(toAgreementListQuery({ ending: false, page: 1 })).toEqual({ page: 0, size: 20 });
    expect(toAgreementListQuery({ status: "ACTIVE", ending: true, page: 3 })).toEqual({
      status: ["ACTIVE"],
      endsWithin30Days: true,
      page: 2,
      size: 20,
    });
    expect(toAgreementListQuery({ ending: false, page: 10000 })).toEqual({ page: 9999, size: 20 });
  });
});
