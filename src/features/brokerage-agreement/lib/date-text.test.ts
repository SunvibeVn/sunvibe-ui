import { describe, expect, it } from "vitest";

import { calendarDateText } from "./date-text";

describe("calendarDateText (brokerage-agreement E05-S2, spec section 6)", () => {
  it("calendarDateText_dates_dayShortMonthYear: a calendar date reads as day, short month and year, with no time-zone shift", () => {
    expect(calendarDateText("2027-01-01")).toBe("1 Jan 2027");
    expect(calendarDateText("2027-12-31")).toBe("31 Dec 2027");
    expect(calendarDateText("2028-02-29")).toBe("29 Feb 2028");
    expect(calendarDateText("not-a-date")).toBe("not-a-date");
  });
});
