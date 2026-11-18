import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

const VIETNAMESE_TEXTS = [
  "Đã có lỗi xảy ra",
  "Trang chưa tải được. Vui lòng thử lại sau ít phút.",
  "Thử lại",
  "Về trang chủ",
];

afterEach(() => {
  window.history.pushState({}, "", "/");
});

function goTo(path: string) {
  window.history.pushState({}, "", path);
}

/** Mounts the whole document: React 19 puts <html> and <body> on the document's own elements. */
function mount(retry: () => void = () => {}) {
  return render(<GlobalError error={new Error("boom-secret-detail")} retry={retry} />, {
    container: document as unknown as HTMLElement,
  });
}

// global-error replaces a failing root layout. The document stays Vietnamese (ADR-008 amendment 2026-10-23); the panel
// follows the screen's language after hydration (marketing-landing SV-250, EP-6).
describe("the global error page (marketing-landing SV-250, EP-6)", () => {
  it.each(["/", "/workspace/x", "/login", "/account"])("globalError_document_alwaysVietnameseLang (%s)", (path) => {
    goTo(path);

    const html = renderToStaticMarkup(<GlobalError error={new Error("boom-secret-detail")} retry={() => {}} />);

    expect(html).toContain('<html lang="vi"');
    expect(html).toContain("<body");
    expect(html).toContain("<title>Đã có lỗi xảy ra</title>");
    expect(html).toMatch(/<h1[^>]*>Đã có lỗi xảy ra<\/h1>/);
    expect(html).not.toContain('<html lang="en"');
  });

  it.each(["/workspace/x", "/login", "/account"])("globalError_englishSection_englishPanel (%s)", (path) => {
    goTo(path);

    mount();

    const heading = screen.getByRole("heading", { level: 1, name: "Something went wrong" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByText("The page could not be loaded. Please try again in a few minutes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(document.documentElement.getAttribute("lang")).toBe("vi");
    for (const text of VIETNAMESE_TEXTS) expect(screen.queryByText(text)).toBeNull();
  });

  it("globalError_publicPath_vietnamesePanel", () => {
    goTo("/");

    mount();

    const heading = screen.getByRole("heading", { level: 1, name: "Đã có lỗi xảy ra" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("vi");
  });

  it.each(["/", "/workspace/x"])("globalError_neverShowsTheError (%s)", (path) => {
    goTo(path);

    const html = renderToStaticMarkup(<GlobalError error={new Error("boom-secret-detail")} retry={() => {}} />);
    mount();

    expect(html).not.toContain("boom-secret-detail");
    expect(document.documentElement.textContent).not.toContain("boom-secret-detail");
  });

  it("globalError_retryCallsRetry", () => {
    goTo("/");
    const retry = vi.fn();

    mount(retry);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("globalError_importsNoMessagesOrIntl: its provider is gone when it renders", () => {
    const source = readFileSync(path.resolve("src/app/global-error.tsx"), "utf8");

    expect(source).not.toMatch(/next-intl|messages\/(?:vi|en)\.json/);
  });
});
