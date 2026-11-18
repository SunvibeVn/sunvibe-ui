import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementListItem, BrokerageAgreementPage } from "../types";

// Edges only: the address, the signed-in user and the list call.
const { address, router, session } = vi.hoisted(() => {
  const user = {
    userId: "u-sale",
    fullName: "Lan Nguyen",
    username: null,
    roles: ["SALE"],
    phoneVerified: true,
    emailVerified: true,
    requiredAction: null,
  };
  return {
    address: { query: "" },
    router: { replace: vi.fn() },
    session: { status: "signed-in", user } as { status: string; user: typeof user | null },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/brokerage-agreements",
  useSearchParams: () => new URLSearchParams(address.query),
  useRouter: () => router,
}));

vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  useSession: (): SessionSnapshot => session as SessionSnapshot,
}));

vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  listAgreements: vi.fn(),
}));

import { listAgreements } from "../services/agreement-api";

import { AgreementListView } from "./agreement-list-view";

const m = en.BrokerageAgreement.list;

const ITEM: BrokerageAgreementListItem = {
  agreementId: "01JF000000000000000000000A",
  unitCode: "P101",
  transactionType: "LONG_TERM_RENT",
  status: "ACTIVE",
  latestVersionNo: 2,
  latestVersionStatus: "ACTIVATED",
  createdAt: "2026-11-20T03:15:00Z",
  advertising: { allowed: false, reasonGroups: ["NOT_STARTED"], endDate: "2027-12-31", startDate: "2027-01-01" },
};

const pageOf = (items: BrokerageAgreementListItem[], totalElements = items.length): ApiResult<BrokerageAgreementPage> => ({
  ok: true,
  status: 200,
  replayed: false,
  data: { items, page: 0, size: 20, totalElements },
});

const EMPTY = pageOf([]);

/** The workspace layout's provider: English messages in Vietnam time (C-41). */
function viewTree() {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementListView />
    </NextIntlClientProvider>
  );
}

function renderView() {
  return render(viewTree());
}

describe("AgreementListView (brokerage-agreement E05-S7, spec section 6, UL-1, UL-3, UL-4)", () => {
  beforeEach(() => {
    vi.mocked(listAgreements).mockReset();
    router.replace.mockReset();
    address.query = "";
    session.status = "signed-in";
    session.user = { ...session.user!, userId: "u-sale" };
  });

  it("agreementListView_loading_statusLine: while the list is on its way, the heading, the filters and the loading line", async () => {
    vi.mocked(listAgreements).mockReturnValue(new Promise(() => undefined));

    renderView();

    expect((await screen.findByRole("status")).textContent).toBe(m.loading);
    expect(screen.getByRole("heading", { level: 1, name: m.title })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: m.state })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: m.endingSoon })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("agreementListView_empty_textByFilter: no row reads No agreements yet. without a filter, and the filtered text with a state or the ending filter", async () => {
    vi.mocked(listAgreements).mockResolvedValue(EMPTY);

    const first = renderView();
    expect(await screen.findByText(m.empty)).toBeTruthy();
    expect(screen.queryByText(m.emptyFiltered)).toBeNull();
    first.unmount();

    address.query = "status=ACTIVE";
    const second = renderView();
    expect(await screen.findByText(m.emptyFiltered)).toBeTruthy();
    second.unmount();

    address.query = "ending=1";
    renderView();
    expect(await screen.findByText(m.emptyFiltered)).toBeTruthy();
    expect(screen.queryByText(m.empty)).toBeNull();
  });

  it("agreementListView_failed_supportCodeAndRetryReadsAgain: a failed read shows the error with its support code, and Try again makes one more call", async () => {
    vi.mocked(listAgreements)
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, fieldErrors: [], correlationId: "c0ffee12" })
      .mockResolvedValueOnce(EMPTY);

    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(m.loadFailed);
    expect(alert.textContent).toContain("Support code: c0ffee12");
    expect(listAgreements).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: m.retry }));

    expect(await screen.findByText(m.empty)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(listAgreements).toHaveBeenCalledTimes(2);
  });

  it("agreementListView_session_nothing: signed out or a session that is unavailable shows nothing; no signed-in user makes no call", async () => {
    vi.mocked(listAgreements).mockResolvedValue({ ok: false, kind: "signed-out" });

    const first = renderView();
    await vi.waitFor(() => expect(listAgreements).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(first.container.textContent).toBe(""));
    first.unmount();

    vi.mocked(listAgreements).mockResolvedValue({ ok: false, kind: "unavailable" });
    const second = renderView();
    await vi.waitFor(() => expect(listAgreements).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(second.container.textContent).toBe(""));
    second.unmount();

    session.user = null;
    const third = renderView();
    expect(third.container.textContent).toBe("");
    expect(listAgreements).toHaveBeenCalledTimes(2);
  });

  it("agreementListView_ready_rowsAndPagination: the rows, and pages of 20 over every match, with the query of the address", async () => {
    address.query = "status=ACTIVE";
    vi.mocked(listAgreements).mockResolvedValue(pageOf([ITEM], 45));

    renderView();

    expect(await screen.findByRole("link", { name: "P101" })).toBeTruthy();
    expect(listAgreements).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listAgreements).mock.calls[0]?.[0]).toEqual({ status: ["ACTIVE"], page: 0, size: 20 });
    const pages = screen.getByRole("navigation", { name: m.pagination.label });
    expect(within(pages).getByText("Page 1 of 3")).toBeTruthy();
    expect(within(pages).getByRole("link", { name: m.pagination.next }).getAttribute("href")).toBe(
      "/workspace/brokerage-agreements?status=ACTIVE&page=2",
    );
    expect(within(pages).queryByRole("link", { name: m.pagination.previous })).toBeNull();
    expect((screen.getByRole("combobox", { name: m.state }) as HTMLSelectElement).value).toBe("ACTIVE");
  });

  it("agreementListView_filterChange_replacesTheAddressOnPageOne: a change of state or of the ending filter replaces the address with page 1", async () => {
    address.query = "status=ACTIVE&page=3";
    vi.mocked(listAgreements).mockResolvedValue(pageOf([ITEM], 45));

    renderView();
    await screen.findByRole("link", { name: "P101" });
    expect(vi.mocked(listAgreements).mock.calls[0]?.[0]).toEqual({ status: ["ACTIVE"], page: 2, size: 20 });

    const select = screen.getByRole("combobox", { name: m.state });
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual([
      m.allStates,
      "Drafting",
      "Awaiting confirmation",
      "Active",
      "Suspended",
      "Expired",
      "Terminated",
      "Cancelled",
    ]);

    fireEvent.change(select, { target: { value: "SUSPENDED" } });
    expect(router.replace).toHaveBeenLastCalledWith("/workspace/brokerage-agreements?status=SUSPENDED", { scroll: false });

    fireEvent.click(screen.getByRole("checkbox", { name: m.endingSoon }));
    expect(router.replace).toHaveBeenLastCalledWith("/workspace/brokerage-agreements?status=ACTIVE&ending=1", { scroll: false });

    fireEvent.change(select, { target: { value: "" } });
    expect(router.replace).toHaveBeenLastCalledWith("/workspace/brokerage-agreements?", { scroll: false });
  });

  it("agreementListView_endingBox_mirrorsTheAddress: a click asks for the new address and ticks nothing; the box shows what the address says", async () => {
    address.query = "status=ACTIVE";
    vi.mocked(listAgreements).mockResolvedValue(pageOf([ITEM]));

    const view = renderView();
    await screen.findByRole("link", { name: "P101" });
    const box = () => screen.getByRole("checkbox", { name: m.endingSoon }) as HTMLInputElement;
    expect(box().checked).toBe(false);

    // Until the navigation ends the address is unchanged, so the box is too (spec section 6). A browser test therefore
    // clicks it and waits for the new address; Playwright's `check()` fails on it (E2E-1, round 1).
    fireEvent.click(box());
    expect(router.replace).toHaveBeenLastCalledWith("/workspace/brokerage-agreements?status=ACTIVE&ending=1", { scroll: false });
    expect(box().checked).toBe(false);

    address.query = "status=ACTIVE&ending=1";
    view.rerender(viewTree());
    expect(box().checked).toBe(true);

    fireEvent.click(box());
    expect(router.replace).toHaveBeenLastCalledWith("/workspace/brokerage-agreements?status=ACTIVE", { scroll: false });
    expect(box().checked).toBe(true);
  });

  it("agreementListView_addressNotNormalized_replacedBeforeAnyCall:an address the list does not accept is replaced first and nothing is asked for it", async () => {
    address.query = "status=active&page=0";
    vi.mocked(listAgreements).mockResolvedValue(EMPTY);

    renderView();

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/workspace/brokerage-agreements?", { scroll: false }));
    expect(listAgreements).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(m.loading);
  });
});
