import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import type { EligibleAssignee, LeadDetail } from "@/features/lead-shared";
import en from "@/i18n/messages/en.json";

import { viewerOf } from "../lib/viewer";

// Edges only: the signed-in user (the key of the note draft), the assignee list call and the assign call.
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
  listAssignees: vi.fn(),
  assignLead: vi.fn(),
}));

import { assignLead, listAssignees } from "../services/owner-leads-api";

import { AssignDialog } from "./assign-dialog";
import { type LeadDetailController, LeadDetailProvider } from "./lead-detail-context";

// jsdom 30 has the dialog element but not its methods. The Dialog component needs two, as a browser has them:
// showModal opens the dialog, close closes it and fires "close".
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

const STAFF: EligibleAssignee[] = [
  { userId: "u-lan", fullName: "Lan Nguyen", roles: ["SALE"] },
  { userId: "u-minh", fullName: "Minh Tran", roles: ["SALE", "SALE_LEADER"] },
];

const loaded = (list: EligibleAssignee[]): ApiResult<EligibleAssignee[]> => ({ ok: true, status: 200, replayed: false, data: list });

/** What the detail page gives the dialog; the dialog reads the lead and its version, and calls back after a save. */
function controllerFor(lead: LeadDetail): LeadDetailController {
  const controller: Partial<LeadDetailController> = {
    userId: "u-leader",
    leadId: "L-1",
    lead,
    version: 4,
    viewer: viewerOf(["SALE_LEADER"]),
    applyCommandResult: vi.fn(),
    reload: vi.fn(async () => true),
    leaveToList: vi.fn(),
  };
  return controller as LeadDetailController;
}

function renderDialog(lead: LeadDetail) {
  const props = { message: null, onMessage: vi.fn(), onDone: vi.fn(), onClose: vi.fn(), onBusy: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <LeadDetailProvider value={controllerFor(lead)}>
        <AssignDialog {...props} />
      </LeadDetailProvider>
    </NextIntlClientProvider>,
  );
  return props;
}

const assigneeSelect = (): HTMLSelectElement => screen.getByRole("combobox", { name: /Assign to/ }) as HTMLSelectElement;

describe("AssignDialog", () => {
  beforeEach(() => {
    vi.mocked(listAssignees).mockReset();
    vi.mocked(assignLead).mockReset();
  });

  it("loads the staff who can take the lead and lists them by name and role", async () => {
    let answer: (result: ApiResult<EligibleAssignee[]>) => void = () => undefined;
    vi.mocked(listAssignees).mockReturnValue(new Promise((resolve) => (answer = resolve)));

    renderDialog({ id: "L-1", assignedUserId: undefined });

    expect(screen.getByRole("dialog", { name: "Assign lead" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading staff…");

    answer(loaded(STAFF));

    expect(await screen.findByRole("option", { name: "Lan Nguyen · Sale" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Minh Tran · Sale leader" })).toBeTruthy();
    expect(assigneeSelect().value).toBe("");
  });

  it("asks for a staff member when Assign is pressed with nobody chosen, and sends nothing", async () => {
    vi.mocked(listAssignees).mockResolvedValue(loaded(STAFF));
    renderDialog({ id: "L-1", assignedUserId: undefined });
    await screen.findByRole("option", { name: "Lan Nguyen · Sale" });

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("Choose a staff member.")).toBeTruthy();
    expect(assignLead).not.toHaveBeenCalled();
  });

  it("opens a reassignment on the current assignee, and pressing Assign for the same person sends nothing", async () => {
    vi.mocked(listAssignees).mockResolvedValue(loaded(STAFF));
    const props = renderDialog({ id: "L-1", assignedUserId: "u-lan", assignedUserName: "Lan Nguyen" });

    expect(screen.getByRole("dialog", { name: "Reassign lead" })).toBeTruthy();
    await screen.findByRole("option", { name: "Lan Nguyen · Sale" });
    expect(assigneeSelect().value).toBe("u-lan");

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await vi.waitFor(() => expect(props.onDone).toHaveBeenCalledWith(null));
    expect(assignLead).not.toHaveBeenCalled();
  });

  it("shows a failed staff list with its support code, and Try again loads it again", async () => {
    vi.mocked(listAssignees)
      .mockResolvedValueOnce({ ok: false, kind: "http", status: 500, fieldErrors: [], correlationId: "c0ffee12" })
      .mockResolvedValueOnce(loaded(STAFF));
    renderDialog({ id: "L-1", assignedUserId: undefined });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the staff list.");
    expect(alert.textContent).toContain("Support code: c0ffee12");
    expect((screen.getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("option", { name: "Lan Nguyen · Sale" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes on Cancel", async () => {
    vi.mocked(listAssignees).mockResolvedValue(loaded(STAFF));
    const props = renderDialog({ id: "L-1", assignedUserId: undefined });
    await screen.findByRole("option", { name: "Lan Nguyen · Sale" });

    // The footer button; the close button in the corner carries the same name.
    const [, footerCancel] = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(footerCancel);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
