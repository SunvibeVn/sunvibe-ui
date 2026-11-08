import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import { type ListFilterChange, type ListState, parseListState } from "../lib/list-url-state";
import { type Viewer, viewerOf } from "../lib/viewer";

// Edges only: the signed-in user and the two list calls of "All Leads".
const { session } = vi.hoisted(() => ({
  session: {
    status: "signed-in",
    user: {
      userId: "u-leader",
      fullName: "Minh Tran",
      username: null,
      roles: ["SALE_LEADER"],
      phoneVerified: true,
      emailVerified: true,
      requiredAction: null,
    },
  },
}));

vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  useSession: (): SessionSnapshot => session as SessionSnapshot,
}));

vi.mock("../services/owner-leads-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/owner-leads-api")>()),
  listWards: vi.fn(),
  listAssignees: vi.fn(),
}));

import { listAssignees, listWards } from "../services/owner-leads-api";

import { LeadFilters } from "./lead-filters";

const SALE = viewerOf(["SALE"]);
const LEADER = viewerOf(["SALE_LEADER"]);

/** The list state the page reads from its URL for this viewer. */
const stateOf = (query: string, viewer: Viewer): ListState => parseListState(new URLSearchParams(query), viewer);

function renderFilters(state: ListState, viewer: Viewer) {
  const onFilter = vi.fn<(change: ListFilterChange) => void>();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LeadFilters state={state} viewer={viewer} rows={[]} onFilter={onFilter} />
    </NextIntlClientProvider>,
  );
  return onFilter;
}

const box = (name: string): HTMLInputElement => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("LeadFilters", () => {
  beforeEach(() => {
    vi.mocked(listWards).mockReset();
    vi.mocked(listAssignees).mockReset();
  });

  it("shows a SALE on My Leads the open statuses ticked, no Unassigned, and nothing to clear", () => {
    renderFilters(stateOf("scope=mine", SALE), SALE);

    for (const name of ["Assigned", "Contacted", "Survey Scheduled", "Qualified", "On Hold"]) expect(box(name).checked).toBe(true);
    for (const name of ["Duplicate", "Declined", "Owner Withdrawn"]) expect(box(name).checked).toBe(false);
    expect(screen.queryByRole("checkbox", { name: "Unassigned" })).toBeNull();
    expect(box("Show closed leads").checked).toBe(false);
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    // Ward and assignee belong to "All Leads": neither list is asked for.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(listWards).not.toHaveBeenCalled();
  });

  it("sends the status set without a box the user unticks, and all three closed ones for Show closed leads", () => {
    const onFilter = renderFilters(stateOf("scope=mine", SALE), SALE);

    fireEvent.click(box("Contacted"));
    expect(onFilter).toHaveBeenLastCalledWith({ statuses: ["ASSIGNED", "SURVEY_SCHEDULED", "QUALIFIED", "ON_HOLD"] });

    fireEvent.click(box("Show closed leads"));
    const last = onFilter.mock.lastCall?.[0];
    expect([...(last?.statuses ?? [])].sort()).toEqual(
      ["ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "QUALIFIED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"].sort(),
    );
  });

  it("shows Show closed leads half ticked for some closed statuses, and a Clear filters link back to the tab", () => {
    renderFilters(stateOf("scope=mine&status=ASSIGNED&status=DUPLICATE", SALE), SALE);

    expect(box("Show closed leads").indeterminate).toBe(true);
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/workspace/owner-leads?scope=mine");
  });

  it("lets a leader on All Leads pick a ward and an assignee from the loaded lists", async () => {
    vi.mocked(listWards).mockResolvedValue({
      ok: true,
      status: 200,
      replayed: false,
      data: [{ code: "20194", name: "Hải Châu", type: "WARD" }],
    });
    vi.mocked(listAssignees).mockResolvedValue({
      ok: true,
      status: 200,
      replayed: false,
      data: [{ userId: "u-lan", fullName: "Lan Nguyen", roles: ["SALE"] }],
    });
    const onFilter = renderFilters(stateOf("scope=all", LEADER), LEADER);

    expect(await screen.findByRole("option", { name: "Ward Hải Châu" })).toBeTruthy();
    expect(await screen.findByRole("option", { name: "Lan Nguyen · Sale" })).toBeTruthy();
    expect(box("Unassigned").checked).toBe(true);

    fireEvent.change(screen.getByRole("combobox", { name: "Ward / commune" }), { target: { value: "20194" } });
    expect(onFilter).toHaveBeenLastCalledWith({ ward: "20194" });

    fireEvent.change(screen.getByRole("combobox", { name: "Assignee" }), { target: { value: "u-lan" } });
    expect(onFilter).toHaveBeenLastCalledWith({ assignee: "u-lan" });
  });

  it("says so when the wards or the staff list cannot be loaded", async () => {
    vi.mocked(listWards).mockResolvedValue({ ok: false, kind: "network" });
    vi.mocked(listAssignees).mockResolvedValue({ ok: false, kind: "http", status: 500, fieldErrors: [] });

    renderFilters(stateOf("scope=all", LEADER), LEADER);

    expect(await screen.findByText("Could not load the wards and communes.")).toBeTruthy();
    expect(await screen.findByText("Could not load the staff list.")).toBeTruthy();
    // The selects stay usable with "any".
    expect((screen.getByRole("combobox", { name: "Ward / commune" }) as HTMLSelectElement).value).toBe("");
  });
});
