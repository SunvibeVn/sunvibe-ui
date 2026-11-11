import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import type { EligibleAssignee, LeadSummary } from "@/features/lead-shared";
import { tabDrafts } from "@/features/lead-shared/client";
import en from "@/i18n/messages/en.json";

import { parseListState, serializeListState } from "../lib/list-url-state";
import { viewerOf } from "../lib/viewer";
import type { AssignLeadsResult, LeadPage } from "../types";

// Edges only: the URL (already normalized for the viewer), the signed-in user and the API calls of the list page.
const { navigation, session } = vi.hoisted(() => ({
  navigation: { query: "", router: { replace: () => undefined } },
  session: {
    status: "signed-in",
    user: {
      userId: "u-leader",
      fullName: "Minh Tran",
      username: null,
      roles: ["SALE_LEADER"] as string[],
      phoneVerified: true,
      emailVerified: true,
      requiredAction: null,
    },
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/owner-leads",
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => navigation.router,
}));

vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  useSession: (): SessionSnapshot => session as SessionSnapshot,
}));

vi.mock("../services/owner-leads-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/owner-leads-api")>()),
  listLeads: vi.fn(),
  listWards: vi.fn(),
  listAssignees: vi.fn(),
  assignLeads: vi.fn(),
  getLead: vi.fn(),
  getLeadSurvey: vi.fn(),
}));

import { assignLeads, getLead, getLeadSurvey, listAssignees, listLeads, listWards } from "../services/owner-leads-api";

import { LeadListView } from "./lead-list-view";

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

const lead = (id: string, status: LeadSummary["status"], version: number, holder: string | null): LeadSummary => ({
  id,
  requestCode: `SV-E2EA-${id}`,
  status,
  version,
  assignedUserId: holder,
  lastActivityAt: "2026-11-01T02:00:00Z",
  createdAt: "2026-11-01T02:00:00Z",
});

const ROWS = [lead("L007", "ASSIGNED", 1, "u-sale"), lead("L009", "ASSIGNED", 2, "u-sale"), lead("L011", "REJECTED", 3, "u-sale")];

/** One answer of the list call; each call gives a new object, as the network does. */
const listAnswer = (): ApiResult<LeadPage> => ({
  ok: true,
  status: 200,
  replayed: false,
  data: { items: ROWS.map((row) => ({ ...row })), page: 0, size: 20, totalElements: ROWS.length },
});

const STAFF: EligibleAssignee[] = [{ userId: "u-lan", fullName: "Lan Nguyen", roles: ["SALE"] }];

function showAs(roles: string[], query: string) {
  session.user.roles = roles;
  navigation.query = serializeListState(parseListState(new URLSearchParams(query), viewerOf(roles)));
}

function renderList() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LeadListView />
    </NextIntlClientProvider>,
  );
}

/** The table and the cards both render in jsdom: the first box of a code is the table's. */
const boxOf = (code: string): HTMLInputElement =>
  screen.getAllByRole("checkbox", { name: `Select ${code}` })[0] as HTMLInputElement;

async function selectAndOpen() {
  await screen.findAllByRole("checkbox", { name: "Select SV-E2EA-L007" });
  fireEvent.click(boxOf("SV-E2EA-L007"));
  fireEvent.click(boxOf("SV-E2EA-L009"));
  expect(screen.getByText("2 leads selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Assign selected" }));
  const dialog = await screen.findByRole("dialog", { name: "Assign 2 leads" });
  await within(dialog).findByRole("option", { name: "Lan Nguyen · Sale" });
  fireEvent.change(within(dialog).getByRole("combobox", { name: /Assign to/ }), { target: { value: "u-lan" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Note" }), { target: { value: "Chuyển lead" } });
  return dialog;
}

describe("LeadListView bulk assignment (acquisition-owner-lead-bulk-assign spec 6.2)", () => {
  beforeEach(() => {
    vi.mocked(listLeads).mockReset().mockImplementation(async () => listAnswer());
    vi.mocked(listWards).mockReset().mockResolvedValue({ ok: true, status: 200, replayed: false, data: [] });
    vi.mocked(listAssignees).mockReset().mockResolvedValue({ ok: true, status: 200, replayed: false, data: STAFF });
    vi.mocked(assignLeads).mockReset();
    tabDrafts.resetFor(null);
  });

  it("selects open rows of All Leads, assigns them, shows the result and reads the list once more with nothing selected", async () => {
    showAs(["SALE_LEADER"], "scope=all&status=ASSIGNED&status=REJECTED");
    const result: AssignLeadsResult = {
      results: [
        { leadId: "L007", outcome: "ASSIGNED" },
        { leadId: "L009", outcome: "STALE" },
      ],
    };
    vi.mocked(assignLeads).mockResolvedValue({ ok: true, status: 200, replayed: false, data: result });
    renderList();

    const dialog = await selectAndOpen();
    expect(screen.queryAllByRole("checkbox", { name: "Select SV-E2EA-L011" })).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));

    const region = await screen.findByRole("region", { name: "Assignment result" });
    expect(within(region).getByText("1 assigned · 0 unchanged · 1 not assigned")).toBeTruthy();
    expect(within(region).getAllByRole("listitem").map((line) => line.textContent)).toEqual([
      "SV-E2EA-L007 Assigned",
      "SV-E2EA-L009 Not assigned: someone else just updated this lead",
    ]);
    expect(assignLeads).toHaveBeenCalledWith({
      assigneeUserId: "u-lan",
      note: "Chuyển lead",
      leads: [
        { leadId: "L007", expectedVersion: 1 },
        { leadId: "L009", expectedVersion: 2 },
      ],
    });

    // The list is read again; the new answer has nothing selected and the panel is free again.
    await vi.waitFor(() => expect(listLeads).toHaveBeenCalledTimes(2));
    await screen.findAllByRole("checkbox", { name: "Select SV-E2EA-L007" });
    expect(boxOf("SV-E2EA-L007").checked).toBe(false);
    expect(boxOf("SV-E2EA-L007").disabled).toBe(false);
    expect(screen.queryByText(/leads? selected$/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Assignment result" })).toBeTruthy();
    // Selecting and assigning read no detail and no survey (AC-17).
    expect(getLead).not.toHaveBeenCalled();
    expect(getLeadSurvey).not.toHaveBeenCalled();

    fireEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Assignment result" })).toBeNull();
  });

  it("shows the unknown-result notice when the answer is lost, reads the list again and keeps the note", async () => {
    showAs(["SALE_LEADER"], "scope=all&status=ASSIGNED");
    vi.mocked(assignLeads).mockResolvedValue({ ok: false, kind: "http", status: 503, fieldErrors: [], correlationId: "c0ffee12" });
    renderList();

    const dialog = await selectAndOpen();
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));

    expect(await screen.findByText(/We could not tell whether the leads were assigned\./)).toBeTruthy();
    expect(screen.getByText("Support code: c0ffee12")).toBeTruthy();
    await vi.waitFor(() => expect(listLeads).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();

    // The dialog opened again holds the typed note.
    await screen.findAllByRole("checkbox", { name: "Select SV-E2EA-L007" });
    fireEvent.click(boxOf("SV-E2EA-L007"));
    fireEvent.click(screen.getByRole("button", { name: "Assign selected" }));
    const again = await screen.findByRole("dialog", { name: "Assign 1 lead" });
    expect((within(again).getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).value).toBe("Chuyển lead");
    // A new action drops the notice.
    expect(screen.queryByText(/We could not tell/)).toBeNull();
  });

  it("selects every open row of the page with select-all and clears them", async () => {
    showAs(["SALE_LEADER"], "scope=all&status=ASSIGNED&status=REJECTED");
    renderList();

    const selectAll = (await screen.findByRole("checkbox", { name: "Select all open leads on this page" })) as HTMLInputElement;
    fireEvent.click(selectAll);
    expect(screen.getByText("2 leads selected")).toBeTruthy();
    expect(boxOf("SV-E2EA-L009").checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText(/leads? selected$/)).toBeNull();
    expect(boxOf("SV-E2EA-L009").checked).toBe(false);
  });

  it("shows no box and no panel on My Leads", async () => {
    showAs(["SALE"], "scope=mine");
    renderList();

    await screen.findAllByRole("link", { name: "View SV-E2EA-L007" });
    expect(screen.queryByRole("checkbox", { name: /^Select / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign selected" })).toBeNull();
  });
});
