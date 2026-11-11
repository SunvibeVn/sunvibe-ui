import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import type { EligibleAssignee } from "@/features/lead-shared";
import { type DraftKey, tabDrafts } from "@/features/lead-shared/client";
import en from "@/i18n/messages/en.json";

import type { LeadSelection, SelectedLead } from "../lib/lead-selection-state";
import type { AssignLeadsResult } from "../types";

// Edges only: the signed-in user (the key of the note draft), the people list call and the bulk assignment call.
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
  assignLeads: vi.fn(),
}));

import { assignLeads, listAssignees } from "../services/owner-leads-api";

import { BulkAssignDialog } from "./bulk-assign-dialog";

// jsdom 30 has the dialog element but not its methods (see assign-dialog.test.tsx).
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
const answered = (result: AssignLeadsResult): ApiResult<AssignLeadsResult> => ({ ok: true, status: 200, replayed: false, data: result });
const failed = (status: number, fields: string[] = [], code?: string): ApiResult<AssignLeadsResult> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "server text" })),
});

const lead = (id: string, version: number, holder: string | null, status: SelectedLead["status"] = "ASSIGNED"): SelectedLead => ({
  id,
  requestCode: `SV-E2EA-${id}`,
  version,
  assignedUserId: holder,
  status,
});

const TWO: LeadSelection = [lead("L7", 1, "u-sale"), lead("L9", 2, "u-sale")];
const NOTE_KEY: DraftKey = { userId: "u-leader", leadId: "", form: "bulkAssignNote" };

function renderDialog(selection: LeadSelection = TWO) {
  const props = { onClose: vi.fn(), onBusy: vi.fn(), onEnd: vi.fn() };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <BulkAssignDialog userId="u-leader" selection={selection} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...props, unmount: view.unmount };
}

const assigneeSelect = (): HTMLSelectElement => screen.getByRole("combobox", { name: /Assign to/ }) as HTMLSelectElement;
const assignButton = (): HTMLButtonElement => screen.getByRole("button", { name: /^Assign/ }) as HTMLButtonElement;
const noteBox = (): HTMLTextAreaElement => screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
const fieldset = (): HTMLFieldSetElement => document.querySelector("fieldset") as HTMLFieldSetElement;

async function ready(selection: LeadSelection = TWO) {
  vi.mocked(listAssignees).mockResolvedValue(loaded(STAFF));
  const props = renderDialog(selection);
  await screen.findByRole("option", { name: "Lan Nguyen · Sale" });
  return props;
}

const pick = (userId: string) => fireEvent.change(assigneeSelect(), { target: { value: userId } });
const type = (text: string) => fireEvent.change(noteBox(), { target: { value: text } });

/** Picks Lan Nguyen, types `note` and presses Assign; the answer is `answer`. */
async function assignWith(answer: ApiResult<AssignLeadsResult>, note = "Chuyển lead", selection: LeadSelection = TWO) {
  vi.mocked(assignLeads).mockResolvedValue(answer);
  const props = await ready(selection);
  pick("u-lan");
  type(note);
  fireEvent.click(assignButton());
  await vi.waitFor(() => expect(assignLeads).toHaveBeenCalledTimes(1));
  return props;
}

describe("BulkAssignDialog (acquisition-owner-lead-bulk-assign D-9, D-11, D-12)", () => {
  beforeEach(() => {
    vi.mocked(listAssignees).mockReset();
    vi.mocked(assignLeads).mockReset();
    tabDrafts.resetFor(null);
  });

  it("lists the eligible people by name and role, picks nobody, and keeps Assign disabled until a pick", async () => {
    let answer: (result: ApiResult<EligibleAssignee[]>) => void = () => undefined;
    vi.mocked(listAssignees).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Assign 2 leads" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading staff…");
    expect(assignButton().disabled).toBe(true);

    answer(loaded(STAFF));

    expect(await screen.findByRole("option", { name: "Lan Nguyen · Sale" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Minh Tran · Sale leader" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /u-lan|u-minh/ })).toBeNull();
    expect(assigneeSelect().value).toBe("");
    expect(assignButton().disabled).toBe(true);
    expect(screen.queryByText(/will be assigned/)).toBeNull();
  });

  it("states the count, the person and the leads held by someone else once a person is picked", async () => {
    await ready();

    pick("u-lan");

    expect(screen.getByText("2 leads will be assigned to Lan Nguyen.")).toBeTruthy();
    expect(screen.getByText("2 of them are held by someone else now. Those people lose access at once.")).toBeTruthy();
    expect(screen.queryByText(/Survey Scheduled/)).toBeNull();
    expect(assignButton().disabled).toBe(false);
  });

  it("says that one scheduled survey moves to the person picked", async () => {
    await ready([lead("L3", 1, "u-sale", "SURVEY_SCHEDULED"), lead("L4", 0, null, "NEW")]);
    expect(screen.queryByText(/Survey Scheduled/)).toBeNull();

    pick("u-lan");

    expect(
      screen.getByText(
        "1 of them is in Survey Scheduled: if its survey is still scheduled, the survey moves to Lan Nguyen and any owner confirmation is removed.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1 of them is held by someone else now, who loses access to it at once.")).toBeTruthy();
  });

  it("says that two scheduled surveys move, in the plural", async () => {
    await ready([lead("L3", 1, "u-sale", "SURVEY_SCHEDULED"), lead("L5", 1, "u-minh", "SURVEY_SCHEDULED")]);

    pick("u-lan");

    expect(
      screen.getByText(
        "2 of them are in Survey Scheduled: a survey still scheduled moves to Lan Nguyen and any owner confirmation is removed.",
      ),
    ).toBeTruthy();
  });

  it("says nothing about surveys when the person picked already holds the scheduled lead", async () => {
    await ready([lead("L3", 1, "u-lan", "SURVEY_SCHEDULED")]);

    pick("u-lan");

    expect(screen.getByText("1 lead will be assigned to Lan Nguyen.")).toBeTruthy();
    expect(screen.getByText("None of them is held by someone else.")).toBeTruthy();
    expect(screen.queryByText(/Survey Scheduled/)).toBeNull();
  });

  it("sends the ids and versions of the snapshot with the person and the trimmed note", async () => {
    await assignWith(answered({ results: [] }), "  Chuyển lead  ");

    expect(assignLeads).toHaveBeenCalledWith({
      assigneeUserId: "u-lan",
      note: "Chuyển lead",
      leads: [
        { leadId: "L7", expectedVersion: 1 },
        { leadId: "L9", expectedVersion: 2 },
      ],
    });
  });

  it("sends once on a double click and locks the dialog while the request runs", async () => {
    let answer: (result: ApiResult<AssignLeadsResult>) => void = () => undefined;
    vi.mocked(assignLeads).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = await ready();
    pick("u-lan");

    fireEvent.click(assignButton());
    fireEvent.click(assignButton());

    await vi.waitFor(() => expect(assignLeads).toHaveBeenCalledTimes(1));
    expect(fieldset().disabled).toBe(true);
    expect(assignButton().disabled).toBe(true);
    expect(assignButton().textContent).toBe("Assigning…");
    expect(props.onBusy).toHaveBeenLastCalledWith(true);

    fireEvent.click(assignButton());
    answer(answered({ results: [{ leadId: "L7", outcome: "ASSIGNED" }, { leadId: "L9", outcome: "ASSIGNED" }] }));

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledTimes(1));
    expect(assignLeads).toHaveBeenCalledTimes(1);
    expect(props.onBusy).toHaveBeenLastCalledWith(false);
  });

  it("still ends the action once and unlocks when the dialog was closed while the request ran (SV-158)", async () => {
    let answer: (result: ApiResult<AssignLeadsResult>) => void = () => undefined;
    vi.mocked(assignLeads).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = await ready();
    pick("u-lan");
    fireEvent.click(assignButton());
    await vi.waitFor(() => expect(assignLeads).toHaveBeenCalledTimes(1));

    // Esc closes the shared dialog: the list view unmounts it while the request goes on.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    props.unmount();

    const result: AssignLeadsResult = { results: [{ leadId: "L7", outcome: "ASSIGNED" }, { leadId: "L9", outcome: "STALE" }] };
    answer(answered(result));

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledTimes(1));
    expect(props.onEnd).toHaveBeenCalledWith({ kind: "result", sent: TWO, result });
    await vi.waitFor(() => expect(props.onBusy).toHaveBeenLastCalledWith(false));
    expect(props.onBusy).toHaveBeenCalledWith(true);
  });

  it("clears the note draft after a 200 in which a lead was assigned", async () => {
    const result: AssignLeadsResult = { results: [{ leadId: "L7", outcome: "ASSIGNED" }, { leadId: "L9", outcome: "STALE" }] };
    const props = await assignWith(answered(result));

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledWith({ kind: "result", sent: TWO, result }));
    expect(tabDrafts.get(NOTE_KEY)).toBeUndefined();
  });

  it("keeps the note draft after a 200 in which no lead was assigned", async () => {
    const result: AssignLeadsResult = { results: [{ leadId: "L7", outcome: "STALE" }, { leadId: "L9", outcome: "STALE" }] };
    const props = await assignWith(answered(result));

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledTimes(1));
    expect(tabDrafts.get(NOTE_KEY)).toBe("Chuyển lead");
  });

  it("shows a 400 on the note at the note, and keeps the dialog and the note", async () => {
    const props = await assignWith(failed(400, ["note"], "VALIDATION_FAILED"));

    expect(await screen.findByText("The note is not valid.")).toBeTruthy();
    expect(noteBox().value).toBe("Chuyển lead");
    expect(props.onEnd).not.toHaveBeenCalled();
  });

  it.each(["leads[0].leadId", "leads.0.expectedVersion"])("shows a 400 on %s as the general message", async (field) => {
    const props = await assignWith(failed(400, [field], "VALIDATION_FAILED"));

    expect(await screen.findByText("Some details are not valid. Please check them.")).toBeTruthy();
    expect(noteBox().value).toBe("Chuyển lead");
    expect(props.onEnd).not.toHaveBeenCalled();
  });

  it("shows a 422, loads the people again and keeps the note and the selection", async () => {
    const props = await assignWith(failed(422, ["assigneeUserId"], "INELIGIBLE_ASSIGNEE"));

    expect(await screen.findByText("This person no longer takes leads. The staff list has been reloaded.")).toBeTruthy();
    await vi.waitFor(() => expect(listAssignees).toHaveBeenCalledTimes(2));
    await screen.findByRole("option", { name: "Lan Nguyen · Sale" });
    expect(noteBox().value).toBe("Chuyển lead");
    expect(screen.getByRole("dialog", { name: "Assign 2 leads" })).toBeTruthy();
    expect(props.onEnd).not.toHaveBeenCalled();
  });

  it("shows the forbidden notice on a 403", async () => {
    const props = await assignWith(failed(403));

    expect(await screen.findByText("You don't have permission to do this.")).toBeTruthy();
    expect(props.onEnd).not.toHaveBeenCalled();
  });

  it("ends with a conflict on a 409 and keeps the note", async () => {
    const props = await assignWith(failed(409, ["expectedVersion"], "CONCURRENT_MODIFICATION"));

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledWith({ kind: "conflict", correlationId: null }));
    expect(tabDrafts.get(NOTE_KEY)).toBe("Chuyển lead");
  });

  it("ends with an unknown result when the answer is lost, and keeps the note", async () => {
    const props = await assignWith({ ok: false, kind: "network" });

    await vi.waitFor(() => expect(props.onEnd).toHaveBeenCalledWith({ kind: "unknown", correlationId: null }));
    expect(tabDrafts.get(NOTE_KEY)).toBe("Chuyển lead");
  });

  it("closes on Cancel", async () => {
    const props = await ready();

    // The footer button; the close button in the corner carries the same name.
    const [, footerCancel] = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(footerCancel);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
