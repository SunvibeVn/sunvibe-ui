import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementCreated, BrokerageEligibility, BrokerageEligibilityUnit } from "../types";

// Edges only: the router the draft dialog moves with, the eligibility read and the create call.
const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("../services/eligibility-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/eligibility-api")>()),
  getEligibility: vi.fn(),
}));

vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  createAgreement: vi.fn(),
}));

import { createAgreement } from "../services/agreement-api";
import { getEligibility } from "../services/eligibility-api";

import { EligibilitySection } from "./eligibility-section";

// jsdom has the dialog element but not its methods (see bulk-assign-dialog.test.tsx).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

const m = en.BrokerageAgreement;
const TITLE = "Agreement eligibility";

const answered = (viewerIsAssignedSale: boolean, units: BrokerageEligibilityUnit[]): ApiResult<BrokerageEligibility> => ({
  ok: true,
  data: { basisState: "USABLE", viewerIsAssignedSale, units },
  status: 200,
  replayed: false,
});
const free: BrokerageEligibilityUnit = { unitId: "U1", unitCode: "P101", eligible: true, reasonGroups: [], unfinishedAgreement: false };

function renderSection() {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <EligibilitySection leadId="L1" refreshKey={1} />
    </NextIntlClientProvider>,
  );
}

const region = () => screen.getByRole("region", { name: TITLE });

/** The one list item of the section, once the read answered. */
async function firstItem() {
  const items = await waitFor(() => {
    const found = within(region()).getAllByRole("listitem");
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  return items[0] as HTMLElement;
}

/** The footer's "Cancel", not the corner close button that carries the same name. */
const cancelButton = (): HTMLElement => {
  const button = screen.getAllByRole("button", { name: m.draft.cancel }).find((found) => found.textContent === m.draft.cancel);
  if (button === undefined) throw new Error("no Cancel button");
  return button;
};

describe("EligibilitySection, the agreement of a unit (brokerage-agreement E05-S2, S2-D11, S2-D14)", () => {
  beforeEach(() => {
    vi.mocked(getEligibility).mockReset();
    vi.mocked(createAgreement).mockReset();
    router.push.mockReset();
  });

  it("eligibilitySection_draftableUnit_draftButtonOpensTheDialog: the assigned Sale drafts on an eligible free unit", async () => {
    vi.mocked(getEligibility).mockResolvedValue(answered(true, [free]));
    renderSection();

    const item = await firstItem();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: m.eligibility.draft }));

    const dialog = screen.getByRole("dialog", { name: m.draft.title });
    expect(within(dialog).getByText("Unit: P101")).toBeTruthy();

    fireEvent.click(cancelButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createAgreement).not.toHaveBeenCalled();
  });

  it("eligibilitySection_inProgressUnit_badgeNoteAndLink: a unit with an agreement of this lead says so and links to it", async () => {
    vi.mocked(getEligibility).mockResolvedValue(answered(true, [{ ...free, unfinishedAgreement: true, agreementId: "A1" }]));
    renderSection();

    const item = await firstItem();
    expect(within(item).getByText(m.eligibility.inProgress)).toBeTruthy();
    expect(within(item).getByText(m.eligibility.inProgressNote)).toBeTruthy();
    expect(within(item).getByRole("link", { name: m.eligibility.openAgreement }).getAttribute("href")).toBe(
      "/workspace/brokerage-agreements/A1",
    );
    expect(within(item).queryByRole("button", { name: m.eligibility.draft })).toBeNull();
    expect(within(item).queryByText(m.eligibility.eligible)).toBeNull();
  });

  it("eligibilitySection_inProgressWithoutId_noLink: an agreement resting on another lead shows the badge and the note, no link", async () => {
    vi.mocked(getEligibility).mockResolvedValue(answered(true, [{ ...free, unfinishedAgreement: true, agreementId: null }]));
    renderSection();

    const item = await firstItem();
    expect(within(item).getByText(m.eligibility.inProgress)).toBeTruthy();
    expect(within(item).getByText(m.eligibility.inProgressNote)).toBeTruthy();
    expect(within(item).queryByRole("link")).toBeNull();
    expect(within(item).queryByRole("button", { name: m.eligibility.draft })).toBeNull();
  });

  it("eligibilitySection_managerViewer_noDraftButton: a viewer who is not the assigned Sale gets no draft button, and the note", async () => {
    vi.mocked(getEligibility).mockResolvedValue(answered(false, [free]));
    renderSection();

    expect(await within(region()).findByText(m.eligibility.assignedOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: m.eligibility.draft })).toBeNull();
  });

  it("eligibilitySection_refusedDraft_readsTheEligibilityAgain: a refused draft reads the eligibility again and keeps the list meanwhile", async () => {
    vi.mocked(getEligibility).mockResolvedValueOnce(answered(true, [free]));
    renderSection();
    const item = await firstItem();
    fireEvent.click(within(item).getByRole("button", { name: m.eligibility.draft }));

    let reread: (result: ApiResult<BrokerageEligibility>) => void = () => undefined;
    vi.mocked(getEligibility).mockReturnValueOnce(new Promise((resolve) => (reread = resolve)));
    const refused: ApiResult<BrokerageAgreementCreated> = {
      ok: false,
      kind: "http",
      status: 409,
      code: "AGREEMENT_EXISTS",
      fieldErrors: [],
    };
    vi.mocked(createAgreement).mockResolvedValue(refused);
    fireEvent.change(screen.getByLabelText(m.draft.startDate), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText(m.draft.endDate), { target: { value: "2027-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: m.draft.submit }));

    await waitFor(() => expect(getEligibility).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getEligibility).mock.calls.map(([leadId]) => leadId)).toEqual(["L1", "L1"]);
    expect(within(region()).getAllByRole("listitem")).toHaveLength(1);
    expect(within(region()).queryByText(m.eligibility.loading)).toBeNull();
    expect(within(screen.getByRole("dialog")).getByText(m.draft.errors.exists)).toBeTruthy();

    reread(answered(true, [{ ...free, unfinishedAgreement: true, agreementId: null }]));
    expect(await within(region()).findByText(m.eligibility.inProgress)).toBeTruthy();
  });
});
