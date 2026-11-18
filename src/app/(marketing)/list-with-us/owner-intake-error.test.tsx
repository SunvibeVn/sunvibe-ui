import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/vi.json";

import OwnerIntakeError from "./error";

// Pin (AI_FLOW section 16) of the /list-with-us error boundary before marketing-landing SV-250 adds the marketing
// group's own boundary: its texts and its retry stay as they are.
describe("the /list-with-us error boundary (owner-intake, pinned before marketing-landing SV-250)", () => {
  it("ownerIntakeError_rendersItsTextsAndRetry", () => {
    const retry = vi.fn();
    const texts = messages.OwnerIntake.page.error;

    render(
      <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
        <OwnerIntakeError error={new Error("pin-secret-detail")} retry={retry} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(texts.title)).toBeTruthy();
    expect(screen.getByText(texts.message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: texts.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("pin-secret-detail");
  });
});
