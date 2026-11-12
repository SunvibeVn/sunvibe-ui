import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { IntakeBlock } from "../types";

// The edge only: the selection call, so no request leaves the test.
vi.mock("../services/intake-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/intake-api")>()),
  putSelection: vi.fn(),
}));

import { putSelection } from "../services/intake-api";

import { type IntakeController, IntakeProvider } from "./intake-context";
import { SelectionStep } from "./selection-step";

const SAVE = "Save the selection";
const WARNING = en.InventoryIntake.selection.changeWarning;

const wholeNew: IntakeBlock = { source: { rentalScope: "WHOLE", spaces: [{ spaceId: "S1", code: "A1" }] } };
const partsNew: IntakeBlock = {
  source: {
    rentalScope: "PARTS",
    spaces: [
      { spaceId: "S1", code: "P101" },
      { spaceId: "S2", code: "P102" },
      { spaceId: "S3", code: "P103" },
    ],
  },
};
const partsDraft: IntakeBlock = { ...partsNew, status: "DRAFT", version: 0, selection: { spaceIds: ["S1", "S2"] } };
const partsConfirmed: IntakeBlock = { ...partsNew, status: "OWNER_CONFIRMED", version: 3, selection: { spaceIds: ["S1", "S2"] } };

const answered = (block: IntakeBlock): ApiResult<IntakeBlock> => ({ ok: true, data: block, status: 200, replayed: false });

/** What the intake page gives its steps: the signed-in assignee of lead L1, with no command on its way. */
function controllerFor(block: IntakeBlock, changes: Partial<IntakeController> = {}): IntakeController {
  return {
    leadId: "L1",
    wardCode: null,
    block,
    viewer: { assignee: true, manager: false },
    epoch: 0,
    busy: false,
    setBusy: vi.fn(),
    reload: vi.fn(async () => undefined),
    apply: vi.fn(),
    leave: vi.fn(),
    notify: vi.fn(),
    ...changes,
  };
}

function view(controller: IntakeController) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <IntakeProvider value={controller}>
        <SelectionStep mode="act" />
      </IntakeProvider>
    </NextIntlClientProvider>
  );
}

const saveButton = (): HTMLButtonElement => screen.getByRole("button", { name: SAVE }) as HTMLButtonElement;
const box = (code: string): HTMLInputElement => screen.getByRole("checkbox", { name: code }) as HTMLInputElement;

describe("SelectionStep (property-create intake spec 4.5)", () => {
  beforeEach(() => {
    vi.mocked(putSelection).mockReset();
  });

  it("with no stored selection, a whole source starts with its one part checked and locked, and Save is enabled", () => {
    render(view(controllerFor(wholeNew)));

    expect(box("A1").checked).toBe(true);
    expect(box("A1").disabled).toBe(true);
    expect(saveButton().disabled).toBe(false);
  });

  it("with no stored selection, parts start unchecked and Save is enabled", () => {
    render(view(controllerFor(partsNew)));

    expect(["P101", "P102", "P103"].map((code) => box(code).checked)).toEqual([false, false, false]);
    expect(saveButton().disabled).toBe(false);
  });

  it("Save is disabled while another command runs", () => {
    render(view(controllerFor(partsNew, { busy: true })));

    expect(saveButton().disabled).toBe(true);
  });

  it("a DRAFT row shows no change warning, also after a part is changed", () => {
    render(view(controllerFor(partsDraft)));
    expect(screen.queryByText(WARNING)).toBeNull();

    fireEvent.click(box("P103"));

    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("on a row past DRAFT, a changed choice shows the change warning and leaves Save enabled", () => {
    render(view(controllerFor(partsConfirmed)));

    fireEvent.click(box("P103"));

    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("an empty choice says what is missing and sends nothing", async () => {
    render(view(controllerFor(partsNew)));

    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toBe("Choose at least one part.");
    expect(putSelection).not.toHaveBeenCalled();
  });

  it("a changed choice is sent with the block's version, and its answer is applied", async () => {
    const after: IntakeBlock = { ...partsConfirmed, status: "DRAFT", version: 4, selection: { spaceIds: ["S1", "S2", "S3"] } };
    vi.mocked(putSelection).mockResolvedValue(answered(after));
    const controller = controllerFor(partsConfirmed);
    render(view(controller));

    fireEvent.click(box("P103"));
    fireEvent.click(saveButton());

    await vi.waitFor(() => expect(controller.apply).toHaveBeenCalledWith(after));
    expect(putSelection).toHaveBeenCalledTimes(1);
    expect(putSelection).toHaveBeenCalledWith("L1", { spaceIds: ["S1", "S2", "S3"], expectedVersion: 3 });
  });

  it("a new epoch with another stored selection restarts the boxes from it", () => {
    const { rerender } = render(view(controllerFor(partsConfirmed)));

    rerender(view(controllerFor({ ...partsConfirmed, selection: { spaceIds: ["S3"] } }, { epoch: 1 })));

    expect(["P101", "P102", "P103"].map((code) => box(code).checked)).toEqual([false, false, true]);
  });
});

describe("SelectionStep with the stored parts chosen again (property-create SV-202)", () => {
  const UNCHANGED = en.InventoryIntake.selection.unchanged;
  const wholeAwaiting: IntakeBlock = { ...wholeNew, status: "AWAITING_OWNER", version: 1, selection: { spaceIds: ["S1"] } };

  beforeEach(() => {
    vi.mocked(putSelection).mockReset();
  });

  it("on a stored selection with the same parts, Save is disabled and says the parts are already saved, with no warning", () => {
    render(view(controllerFor(partsConfirmed)));

    const line = screen.getByText(UNCHANGED);
    expect(saveButton().disabled).toBe(true);
    expect(line.id).not.toBe("");
    expect(saveButton().getAttribute("aria-describedby")).toBe(line.id);
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("a whole source with a stored selection is not offered an enabled Save", () => {
    render(view(controllerFor(wholeAwaiting)));

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(UNCHANGED)).toBeTruthy();
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("choosing back to the stored parts disables Save again", () => {
    render(view(controllerFor(partsConfirmed)));

    fireEvent.click(box("P103"));
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(screen.queryByText(UNCHANGED)).toBeNull();

    fireEvent.click(box("P103"));
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(UNCHANGED)).toBeTruthy();
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("the same parts submitted from the keyboard send nothing", async () => {
    vi.mocked(putSelection).mockResolvedValue(answered(partsConfirmed));
    render(view(controllerFor(partsConfirmed)));
    const form = saveButton().closest("form");
    if (form === null) throw new Error("the step has no form");

    await act(async () => {
      form.requestSubmit();
    });

    expect(putSelection).not.toHaveBeenCalled();
  });
});
