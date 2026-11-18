import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/vi.json";

import { SiteErrorPanel } from "./site-error-panel";

describe("SiteErrorPanel (marketing-landing SV-250)", () => {
  it("siteErrorPanel_rendersTextsAndRetry", () => {
    const retry = vi.fn();

    const { container } = render(<SiteErrorPanel texts={messages.SiteError} retry={retry} lang="vi" />);

    expect(screen.getByRole("heading", { level: 1, name: "Đã có lỗi xảy ra" })).toBeTruthy();
    expect(screen.getByText(messages.SiteError.message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect((container.firstElementChild as HTMLElement).getAttribute("lang")).toBe("vi");
  });

  it("siteErrorPanel_homeLink_fullPageToRoot: a plain <a>, a full page load after an error", () => {
    render(<SiteErrorPanel texts={messages.SiteError} retry={() => {}} lang="vi" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("Về trang chủ");
    expect(links[0].getAttribute("href")).toBe("/");
    expect(links[0].tagName).toBe("A");
  });
});
