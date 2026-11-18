import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import vi from "@/i18n/messages/vi.json";

import { NotFoundPanel } from "./not-found-panel";

describe("NotFoundPanel (marketing-landing SV-250)", () => {
  it("notFoundPanel_rendersTitleMessageAndHomeLink", () => {
    const { container } = render(<NotFoundPanel texts={vi.NotFound} lang="vi" />);

    expect(screen.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeTruthy();
    expect(screen.getByText(vi.NotFound.message)).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("Về trang chủ");
    expect(links[0].getAttribute("href")).toBe("/");
    expect((container.firstElementChild as HTMLElement).getAttribute("lang")).toBe("vi");
  });
});
