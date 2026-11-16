import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageEligibility } from "../types";

// The edge only: the eligibility call, so no request leaves the test.
vi.mock("../services/eligibility-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/eligibility-api")>()),
  getEligibility: vi.fn(),
}));

import { getEligibility } from "../services/eligibility-api";

import { EligibilitySection } from "./eligibility-section";

const m = en.BrokerageAgreement.eligibility;
const TITLE = "Agreement eligibility";

const answered = (data: BrokerageEligibility): ApiResult<BrokerageEligibility> => ({
  ok: true,
  data,
  status: 200,
  replayed: false,
});
const http = (status: number, code: string, correlationId?: string): ApiResult<BrokerageEligibility> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  ...(correlationId === undefined ? {} : { correlationId }),
});

const usable = (viewerIsAssignedSale: boolean): ApiResult<BrokerageEligibility> =>
  answered({
    basisState: "USABLE",
    viewerIsAssignedSale,
    units: [
      { unitId: "U1", unitCode: "P101", eligible: true, reasonGroups: [] },
      { unitId: "U2", unitCode: null, eligible: false, reasonGroups: ["UNIT", "OWNER"] },
    ],
  });

/** An answer the test gives when it wants, to see what shows while the read is on its way. */
function pending() {
  let resolve: (result: ApiResult<BrokerageEligibility>) => void = () => undefined;
  const promise = new Promise<ApiResult<BrokerageEligibility>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function view(refreshKey: number | undefined = 1) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <EligibilitySection leadId="L1" refreshKey={refreshKey} />
    </NextIntlClientProvider>
  );
}

const region = () => screen.getByRole("region", { name: TITLE });

describe("EligibilitySection (brokerage-agreement E05-S1, spec section 6)", () => {
  beforeEach(() => {
    vi.mocked(getEligibility).mockReset();
  });

  it("eligibilitySection_ready_listsUnitsWithTheirGroups: each unit with its code, whether it can get an agreement, and why not", async () => {
    const first = pending();
    vi.mocked(getEligibility).mockReturnValue(first.promise);
    render(view());

    expect(within(region()).getByText(m.loading)).toBeTruthy();
    first.resolve(usable(true));

    const items = await waitFor(() => {
      const found = within(region()).getAllByRole("listitem");
      expect(found).toHaveLength(2);
      return found;
    });
    expect(within(items[0]).getByText("P101")).toBeTruthy();
    expect(within(items[0]).getByText(m.eligible)).toBeTruthy();
    expect(within(items[1]).getByText(m.noCode)).toBeTruthy();
    expect(within(items[1]).getByText(m.notEligible)).toBeTruthy();
    expect(within(items[1]).getByText(m.reasons.UNIT)).toBeTruthy();
    expect(within(items[1]).getByText(m.reasons.OWNER)).toBeTruthy();
    expect(screen.queryByText(m.assignedOnly)).toBeNull();
    expect(screen.queryByText(m.loading)).toBeNull();
    expect(getEligibility).toHaveBeenCalledWith("L1");
  });

  it("eligibilitySection_hiddenAnswers_renderNothing: a 404 and a 403 leave no region", async () => {
    for (const answer of [http(404, "NOT_FOUND", "c-1"), http(403, "FORBIDDEN", "c-2")]) {
      vi.mocked(getEligibility).mockResolvedValue(answer);
      const { unmount } = render(view());

      await waitFor(() => expect(getEligibility).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("region", { name: TITLE })).toBeNull());

      unmount();
      vi.mocked(getEligibility).mockReset();
    }
  });

  it("eligibilitySection_failedRead_retryReadsAgain: a failed read says so with its support code, and Try again reads again", async () => {
    vi.mocked(getEligibility).mockResolvedValueOnce(http(500, "INTERNAL_ERROR", "c-9"));
    render(view());

    expect(await within(region()).findByText(m.loadFailed)).toBeTruthy();
    expect(within(region()).getByText("Support code: c-9")).toBeTruthy();

    const second = pending();
    vi.mocked(getEligibility).mockReturnValueOnce(second.promise);
    fireEvent.click(within(region()).getByRole("button", { name: m.retry }));

    expect(within(region()).getByText(m.loading)).toBeTruthy();
    expect(screen.queryByText(m.loadFailed)).toBeNull();
    second.resolve(usable(true));

    await waitFor(() => expect(within(region()).getAllByRole("listitem")).toHaveLength(2));
    expect(getEligibility).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getEligibility).mock.calls.map(([leadId]) => leadId)).toEqual(["L1", "L1"]);
  });

  it("eligibilitySection_managerViewer_showsAssignedOnlyNote: a viewer who is not the assigned Sale reads who drafts", async () => {
    vi.mocked(getEligibility).mockResolvedValue(usable(false));
    render(view());

    expect(await within(region()).findByText(m.assignedOnly)).toBeTruthy();
  });

  it("eligibilitySection_refreshKeyChange_readsAgain: a new lead version reads again and keeps the list until the answer", async () => {
    vi.mocked(getEligibility).mockResolvedValueOnce(usable(true));
    const { rerender } = render(view(1));
    await waitFor(() => expect(within(region()).getAllByRole("listitem")).toHaveLength(2));

    const second = pending();
    vi.mocked(getEligibility).mockReturnValueOnce(second.promise);
    rerender(view(2));

    await waitFor(() => expect(getEligibility).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getEligibility).mock.calls.map(([leadId]) => leadId)).toEqual(["L1", "L1"]);
    expect(within(region()).getByText("P101")).toBeTruthy();
    expect(screen.queryByText(m.loading)).toBeNull();

    second.resolve(
      answered({
        basisState: "SUSPENDED",
        viewerIsAssignedSale: true,
        units: [{ unitId: "U1", unitCode: "P101", eligible: false, reasonGroups: ["BASIS"] }],
      }),
    );
    expect(await within(region()).findByText(m.reasons.BASIS)).toBeTruthy();
  });
});

// Brief E-1 as a standing line of the region, and the region's NONE and empty-list states (brokerage-agreement E05-S3,
// S3-D19, spec section 3.5).
const E1 =
  "Units created by the old direct property form, and survey parts left out of an intake, are not listed here. They need an intake or unit management first.";
const NO_BASIS = "This lead has no completed intake yet.";
const NO_UNITS = "The intake result of this lead lists no unit.";
const none = answered({ basisState: "NONE", viewerIsAssignedSale: true, units: [] });

describe("EligibilitySection, brief E-1 and the states without units (brokerage-agreement E05-S3, S3-D19)", () => {
  beforeEach(() => {
    vi.mocked(getEligibility).mockReset();
  });

  it("eligibilitySection_noneBasis_regionWithItsLineAndE1: no completed intake keeps the region with its line and E-1, no list", async () => {
    vi.mocked(getEligibility).mockResolvedValue(none);
    render(view());

    expect(await within(region()).findByText(NO_BASIS)).toBeTruthy();
    expect(within(region()).getByRole("heading", { name: TITLE })).toBeTruthy();
    expect(within(region()).getByText(E1)).toBeTruthy();
    expect(within(region()).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(region()).queryByText(m.loading)).toBeNull();
  });

  it("eligibilitySection_everyShownState_holdsTheE1Line: loading, none, ready and error each hold the E-1 line once, with no link and no number", async () => {
    const e1Once = () => {
      const lines = within(region()).getAllByText(E1);
      expect(lines).toHaveLength(1);
      const line = lines[0] as HTMLElement;
      expect(line.tagName).toBe("P");
      expect(within(line).queryByRole("link")).toBeNull();
      expect(line.textContent).not.toMatch(/\d/);
      expect(line.closest("li")).toBeNull();
    };

    const first = pending();
    vi.mocked(getEligibility).mockReturnValueOnce(first.promise);
    const { unmount } = render(view());
    expect(within(region()).getByText(m.loading)).toBeTruthy();
    e1Once();
    first.resolve(none);
    await within(region()).findByText(NO_BASIS);
    e1Once();
    unmount();

    vi.mocked(getEligibility).mockResolvedValueOnce(usable(true));
    const ready = render(view());
    await waitFor(() => expect(within(region()).getAllByRole("listitem")).toHaveLength(2));
    e1Once();
    ready.unmount();

    vi.mocked(getEligibility).mockResolvedValueOnce(http(500, "INTERNAL_ERROR", "c-9"));
    render(view());
    await within(region()).findByText(m.loadFailed);
    e1Once();
  });

  it("eligibilitySection_readyWithoutUnits_noUnitsSentence: a basis whose intake lists no unit says so, with no list", async () => {
    vi.mocked(getEligibility).mockResolvedValue(answered({ basisState: "USABLE", viewerIsAssignedSale: true, units: [] }));
    render(view());

    expect(await within(region()).findByText(NO_UNITS)).toBeTruthy();
    expect(within(region()).getByText(E1)).toBeTruthy();
    expect(within(region()).queryByRole("list")).toBeNull();
    expect(within(region()).queryByText(NO_BASIS)).toBeNull();
  });

  it("eligibilitySection_firstReadOfNone_regionStaysInPlace: the region shows from the first render and stays when NONE arrives", async () => {
    const first = pending();
    vi.mocked(getEligibility).mockReturnValue(first.promise);
    render(view());

    const before = region();
    expect(within(before).getByText(m.loading)).toBeTruthy();
    expect(within(before).getByText(E1)).toBeTruthy();
    first.resolve(none);

    expect(await within(before).findByText(NO_BASIS)).toBeTruthy();
    expect(region()).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(within(before).queryByText(m.loading)).toBeNull();
  });

  it("eligibilitySection_hiddenStates_noRegionAndNoE1: signed out, unavailable and an answer without basisState show no region and no E-1", async () => {
    const answers: ApiResult<BrokerageEligibility>[] = [
      { ok: false, kind: "signed-out" },
      { ok: false, kind: "unavailable" },
      answered({ viewerIsAssignedSale: true, units: [] }),
    ];
    for (const answer of answers) {
      vi.mocked(getEligibility).mockResolvedValue(answer);
      const { unmount } = render(view());

      await waitFor(() => expect(getEligibility).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("region", { name: TITLE })).toBeNull());
      expect(screen.queryByText(E1)).toBeNull();

      unmount();
      vi.mocked(getEligibility).mockReset();
    }
  });
});
