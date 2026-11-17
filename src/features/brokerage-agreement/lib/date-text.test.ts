import { describe, expect, it } from "vitest";

import { calendarDateText, vietnamTimeText } from "./date-text";

describe("calendarDateText (brokerage-agreement E05-S2, spec section 6)", () => {
  it("calendarDateText_dates_dayShortMonthYear: a calendar date reads as day, short month and year, with no time-zone shift", () => {
    expect(calendarDateText("2027-01-01")).toBe("1 Jan 2027");
    expect(calendarDateText("2027-12-31")).toBe("31 Dec 2027");
    expect(calendarDateText("2028-02-29")).toBe("29 Feb 2028");
    expect(calendarDateText("not-a-date")).toBe("not-a-date");
  });
});

describe("vietnamTimeText (brokerage-agreement E05-S5, spec section 6, S5-D19 (5))", () => {
  it("dateText_vietnamTime_dayAfterUtc: an instant reads as yyyy-MM-dd HH:mm in Vietnam time, whatever the browser's zone, the day after when UTC is late evening", () => {
    expect(vietnamTimeText("2026-11-24T17:30:00Z")).toBe("2026-11-25 00:30");
    expect(vietnamTimeText("2026-11-24T17:30:00.123456Z")).toBe("2026-11-25 00:30");
    expect(vietnamTimeText("2026-11-17T03:15:00.987654Z")).toBe("2026-11-17 10:15");
    expect(vietnamTimeText("2026-12-31T16:59:59Z")).toBe("2026-12-31 23:59");
    expect(vietnamTimeText("2026-12-31T17:00:00Z")).toBe("2027-01-01 00:00");
    expect(vietnamTimeText("not-a-time")).toBe("not-a-time");
  });
});
