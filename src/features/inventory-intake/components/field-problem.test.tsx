import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { FieldProblem } from "./field-problem";

// The selection step shows this text when no part is chosen (InventoryIntake.selection.problems.required).
const REQUIRED = en.InventoryIntake.selection.problems.required;

describe("FieldProblem", () => {
  it("shows the problem as an alert, so a screen reader reads it out", () => {
    render(<FieldProblem id="selection-error">{REQUIRED}</FieldProblem>);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Choose at least one part.");
    expect(alert.id).toBe("selection-error");
  });

  it("takes the focus when it appears, away from the button that was pressed", () => {
    const { rerender } = render(
      <>
        <button type="button">Save the selection</button>
      </>,
    );
    screen.getByRole("button", { name: "Save the selection" }).focus();

    rerender(
      <>
        <button type="button">Save the selection</button>
        <FieldProblem>{REQUIRED}</FieldProblem>
      </>,
    );

    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });
});
