import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementHistory, BrokerageAgreementHistoryEntry } from "../types";

// The edge only: the history call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreementHistory: vi.fn(),
}));

import { getAgreementHistory } from "../services/agreement-api";

import { AgreementHistorySection } from "./agreement-history-section";

const h = en.BrokerageAgreement.history;
const AGREEMENT_ID = "01JF000000000000000000000A";

const entry = (type: string, versionNo: number | null, actorType: string, actorName: string | null, occurredAt: string) =>
  ({ type, versionNo, actorType, actorName, occurredAt }) as BrokerageAgreementHistoryEntry;

const ACTIVATED = entry("ACTIVATED", 2, "STAFF", "Tran Thi B", "2026-12-20T02:00:00Z");
const CONFIRMED = entry("OWNER_CONFIRMED", 2, "OWNER", null, "2026-12-18T09:30:00Z");
const LAPSED = entry("VERSION_LAPSED", 1, "SYSTEM", null, "2026-12-10T17:30:00Z");
const EDITED = entry("DRAFT_EDITED", 1, "STAFF", null, "2026-12-01T03:00:00Z");
const UNKNOWN = entry("CONTRACT_TERMINATED", null, "ROBOT", "Someone", "2026-11-30T03:00:00Z");
const CREATED = entry("CREATED", 1, "STAFF", "Le Van C", "2026-11-20T03:15:00Z");

const page = (entries: BrokerageAgreementHistoryEntry[], pageNo: number, totalElements: number): ApiResult<BrokerageAgreementHistory> => ({
  ok: true,
  status: 200,
  replayed: false,
  data: { entries, page: pageNo, size: 50, totalElements },
});

/** An answer the test releases when it chooses. */
function held<T>() {
  let release: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => (release = resolve));
  return { promise, release };
}

/** Holds `open` as the agreement page does (E05S7-P10) and passes `onToggle`. */
function Harness({ dataVersion, initiallyOpen = false }: { dataVersion: number | null; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <AgreementHistorySection
      agreementId={AGREEMENT_ID}
      dataVersion={dataVersion}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    />
  );
}

const withProvider = (node: ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
    {node}
  </NextIntlClientProvider>
);

const region = () => screen.getByRole("region", { name: h.title });
const entries = () => within(region()).queryAllByRole("listitem");
const calls = () => vi.mocked(getAgreementHistory).mock.calls.map(([id, query]) => [id, query]);

describe("AgreementHistorySection (brokerage-agreement E05-S7, S7-D12, UH-1, UH-2, E05S7-P8)", () => {
  beforeEach(() => {
    vi.mocked(getAgreementHistory).mockReset();
  });

  it("agreementHistorySection_collapsed_noCall: collapsed, the region holds its level-2 heading and Show history, and nothing is read", () => {
    render(withProvider(<Harness dataVersion={3} />));

    expect(within(region()).getByRole("heading", { level: 2, name: h.title })).toBeTruthy();
    const button = within(region()).getByRole("button", { name: h.show });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(within(region()).queryByRole("list")).toBeNull();
    expect(within(region()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(getAgreementHistory).not.toHaveBeenCalled();
  });

  it("agreementHistorySection_show_firstPageEntries: Show history reads page 0 of 50 and shows each entry's event, version, actor and Vietnam time", async () => {
    vi.mocked(getAgreementHistory).mockResolvedValueOnce(page([ACTIVATED, CONFIRMED, LAPSED, EDITED, UNKNOWN], 0, 5));
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));

    expect(within(region()).getByRole("status").textContent).toBe(h.loading);
    expect(await within(region()).findByText("Activated")).toBeTruthy();
    expect(calls()).toEqual([[AGREEMENT_ID, { page: 0, size: 50 }]]);
    const button = within(region()).getByRole("button", { name: h.hide });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(within(region()).queryByRole("status")).toBeNull();

    const [activated, confirmed, lapsed, edited, unknown] = entries() as HTMLElement[];
    expect(entries()).toHaveLength(5);
    expect(within(activated!).getByText("Activated")).toBeTruthy();
    expect(within(activated!).getByText("Version 2")).toBeTruthy();
    expect(within(activated!).getByText("Tran Thi B")).toBeTruthy();
    expect(within(activated!).getByText("2026-12-20 09:00")).toBeTruthy();
    expect(within(confirmed!).getByText("Confirmed by the owner")).toBeTruthy();
    expect(within(confirmed!).getByText("The owner")).toBeTruthy();
    expect(within(confirmed!).getByText("2026-12-18 16:30")).toBeTruthy();
    expect(within(lapsed!).getByText("Lapsed")).toBeTruthy();
    expect(within(lapsed!).getByText("Sunvibe (automatic)")).toBeTruthy();
    expect(within(lapsed!).getByText("2026-12-11 00:30")).toBeTruthy();
    expect(within(edited!).getByText("Draft edited")).toBeTruthy();
    expect(within(edited!).getByText("A staff member")).toBeTruthy();
    expect(within(unknown!).getByText("Another event")).toBeTruthy();
    expect(within(unknown!).queryByText(/^Version /)).toBeNull();
    expect(within(unknown!).queryByText("Someone")).toBeNull();
    expect(within(region()).queryByRole("button", { name: h.older })).toBeNull();
    expect(within(region()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("agreementHistorySection_mountedOpen_readsPageZero: a section mounted open, as after a reread of the page, reads page 0 at once", async () => {
    vi.mocked(getAgreementHistory).mockResolvedValueOnce(page([CREATED], 0, 1));
    render(withProvider(<Harness dataVersion={3} initiallyOpen />));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(within(region()).getByText("Le Van C")).toBeTruthy();
    expect(calls()).toEqual([[AGREEMENT_ID, { page: 0, size: 50 }]]);
  });

  it("agreementHistorySection_older_appendsUntilTotal: Show older entries appends the next page and is gone once every entry is shown", async () => {
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(page([ACTIVATED], 0, 2))
      .mockResolvedValueOnce(page([CREATED], 1, 2));
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    fireEvent.click(await within(region()).findByRole("button", { name: h.older }));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(entries().map((item) => item.textContent)).toEqual([
      expect.stringContaining("Activated"),
      expect.stringContaining("Agreement drafted"),
    ]);
    expect(calls()).toEqual([
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 1, size: 50 }],
    ]);
    expect(within(region()).queryByRole("button", { name: h.older })).toBeNull();
  });

  it("agreementHistorySection_olderTwice_oneCallPerPage: a double click on Show older entries asks for the next page once and adds each entry once", async () => {
    const older = held<ApiResult<BrokerageAgreementHistory>>();
    vi.mocked(getAgreementHistory).mockResolvedValueOnce(page([ACTIVATED], 0, 2)).mockReturnValueOnce(older.promise);
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    const button = await within(region()).findByRole("button", { name: h.older });
    fireEvent.click(button);
    fireEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(getAgreementHistory).toHaveBeenCalledTimes(2);
    await act(async () => older.release(page([CREATED], 1, 2)));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(entries()).toHaveLength(2);
    expect(getAgreementHistory).toHaveBeenCalledTimes(2);
  });

  it("agreementHistorySection_states_emptyAndErrorRetry: no entry reads No events yet.; a failed read says so and Try again reads that page again", async () => {
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(page([], 0, 0))
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, fieldErrors: [], correlationId: "c0ffee12" })
      .mockResolvedValueOnce(page([CREATED], 0, 1));
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    expect(await within(region()).findByText(h.empty)).toBeTruthy();
    expect(within(region()).queryByRole("list")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: h.hide }));
    fireEvent.click(screen.getByRole("button", { name: h.show }));
    const alert = await within(region()).findByRole("alert");
    expect(alert.textContent).toContain(h.loadFailed);
    expect(alert.textContent).not.toContain("c0ffee12");

    fireEvent.click(within(region()).getByRole("button", { name: h.retry }));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(within(region()).queryByRole("alert")).toBeNull();
    expect(calls()).toEqual([
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 0, size: 50 }],
    ]);
  });

  it("agreementHistorySection_olderFailed_retryReadsThatPage: a failed older page keeps the entries shown and Try again reads that page again", async () => {
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(page([ACTIVATED], 0, 2))
      .mockResolvedValueOnce({ ok: false, kind: "network" })
      .mockResolvedValueOnce(page([CREATED], 1, 2));
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    fireEvent.click(await within(region()).findByRole("button", { name: h.older }));
    expect(await within(region()).findByRole("alert")).toBeTruthy();
    expect(within(region()).getByText("Activated")).toBeTruthy();

    fireEvent.click(within(region()).getByRole("button", { name: h.retry }));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(entries()).toHaveLength(2);
    expect(calls().map(([, query]) => query)).toEqual([
      { page: 0, size: 50 },
      { page: 1, size: 50 },
      { page: 1, size: 50 },
    ]);
  });

  it("agreementHistorySection_session_nothing: signed out or a session that is unavailable shows no entry, text or error", async () => {
    vi.mocked(getAgreementHistory).mockResolvedValueOnce({ ok: false, kind: "signed-out" });
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));

    await vi.waitFor(() => expect(within(region()).queryByRole("status")).toBeNull());
    expect(within(region()).queryByRole("alert")).toBeNull();
    expect(within(region()).queryByText(h.empty)).toBeNull();
    expect(within(region()).queryByRole("list")).toBeNull();
  });

  it("agreementHistorySection_dataVersionChange_reloadsPageZero: a new data version while open reads page 0 again and replaces the entries", async () => {
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(page([CREATED], 0, 1))
      .mockResolvedValueOnce(page([ACTIVATED, CREATED], 0, 2));
    const view = render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();

    view.rerender(withProvider(<Harness dataVersion={4} />));

    expect(await within(region()).findByText("Activated")).toBeTruthy();
    expect(entries()).toHaveLength(2);
    expect(within(region()).getByRole("button", { name: h.hide })).toBeTruthy();
    expect(calls()).toEqual([
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 0, size: 50 }],
    ]);
  });

  it("agreementHistorySection_reloadDuringOlder_dropsTheStaleAnswer: a new data version while the older page loads shows the new page 0 and never appends the late page", async () => {
    const older = held<ApiResult<BrokerageAgreementHistory>>();
    vi.mocked(getAgreementHistory)
      .mockResolvedValueOnce(page([ACTIVATED], 0, 2))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(page([LAPSED], 0, 3));
    const view = render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    fireEvent.click(await within(region()).findByRole("button", { name: h.older }));
    view.rerender(withProvider(<Harness dataVersion={4} />));

    expect(await within(region()).findByText("Lapsed")).toBeTruthy();
    await act(async () => older.release(page([CREATED], 1, 2)));

    expect(entries()).toHaveLength(1);
    expect(within(region()).queryByText("Agreement drafted")).toBeNull();
    expect(within(region()).queryByText("Activated")).toBeNull();
    expect(calls().map(([, query]) => query)).toEqual([
      { page: 0, size: 50 },
      { page: 1, size: 50 },
      { page: 0, size: 50 },
    ]);
  });

  it("agreementHistorySection_reopen_readsPageZeroAgain: Hide history clears the entries and drops a read in flight; Show history reads page 0 again", async () => {
    const first = held<ApiResult<BrokerageAgreementHistory>>();
    vi.mocked(getAgreementHistory).mockReturnValueOnce(first.promise).mockResolvedValueOnce(page([CREATED], 0, 1));
    render(withProvider(<Harness dataVersion={3} />));

    fireEvent.click(screen.getByRole("button", { name: h.show }));
    fireEvent.click(screen.getByRole("button", { name: h.hide }));
    await act(async () => first.release(page([ACTIVATED], 0, 1)));
    expect(within(region()).queryByText("Activated")).toBeNull();
    expect(within(region()).queryByRole("list")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: h.show }));

    expect(await within(region()).findByText("Agreement drafted")).toBeTruthy();
    expect(within(region()).queryByText("Activated")).toBeNull();
    expect(calls()).toEqual([
      [AGREEMENT_ID, { page: 0, size: 50 }],
      [AGREEMENT_ID, { page: 0, size: 50 }],
    ]);
  });
});
