import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { RefusedPhotoLine } from "../../lib/checklist/refused-photo-model";

import { NotCarriedNotice } from "./not-carried-notice";

/** The workspace layout's provider: English messages (C-41). */
function renderNotice(lines: readonly RefusedPhotoLine[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <NotCarriedNotice lines={lines} />
    </NextIntlClientProvider>,
  );
}

describe("NotCarriedNotice (survey-checklist SV-310 RU-2: the refused photos this revision does not hold)", () => {
  it("is one titled region with its text and one item per line, not an alert and without an h4", () => {
    renderNotice([{ key: "R1:X", text: "Space P1 · Kitchen: Blurred (revision #1)" }]);

    const region = screen.getByRole("region", { name: "Not carried into this revision" });
    expect(
      within(region).getByText(
        "A reviewer did not accept these photos, so this revision does not hold them. They stay in their earlier revision.",
      ),
    ).toBeTruthy();
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("Space P1 · Kitchen: Blurred (revision #1)");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("renders nothing without lines", () => {
    const { container } = renderNotice([]);

    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("region")).toBeNull();
  });
});
