import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import type { IntakeBlock } from "../types";

import { type IntakeController, IntakeProvider } from "./intake-context";
import { ResultPanel } from "./result-panel";

/** A usable result whose two units are stopped from elsewhere (property-create SV-215, the labels of SV-301). */
const stopped: IntakeBlock = {
  status: "COMPLETED",
  version: 7,
  readiness: {
    state: "USABLE",
    units: [
      { unitId: "U1", unitCode: "P101", usable: false, reasons: ["PROPERTY_STOP"] },
      { unitId: "U2", unitCode: "P102", usable: false, reasons: ["UNIT_STOP"] },
    ],
  },
};

/** What the intake page gives its panels: the signed-in assignee of lead L1, with no command on its way. */
function controllerFor(block: IntakeBlock): IntakeController {
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
  };
}

function view(block: IntakeBlock) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <IntakeProvider value={controllerFor(block)}>
        <ResultPanel />
      </IntakeProvider>
    </NextIntlClientProvider>
  );
}

describe("ResultPanel unit stops (property-create SV-301)", () => {
  it("resultPanel_propertyAndUnitStops_showTheirLabels: each stopped unit reads its stop as words", () => {
    render(view(stopped));

    expect(screen.getByText("P101: Stopped for the whole property")).toBeTruthy();
    expect(screen.getByText("P102: Stopped for this unit")).toBeTruthy();
  });

  it("resultPanel_stopLabels_nameNoLead: neither stop label names a lead", () => {
    render(view(stopped));

    const lines = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/^P10[12]: \S/);
      expect(line).not.toMatch(/lead/i);
    }
  });
});
