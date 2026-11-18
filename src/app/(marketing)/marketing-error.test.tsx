import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/vi.json";

import MarketingError from "./error";

describe("the marketing group's error boundary (marketing-landing SV-250, EP-5)", () => {
  it("marketingError_showsSiteErrorTexts_notTheError", () => {
    const retry = vi.fn();

    render(
      <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
        <MarketingError error={new Error("boom-secret-detail")} retry={retry} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Đã có lỗi xảy ra" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Về trang chủ" }).getAttribute("href")).toBe("/");
    expect(document.body.textContent).not.toContain("boom-secret-detail");
  });
});
