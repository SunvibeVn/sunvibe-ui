import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RootError from "./error";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  const retry = vi.fn();
  render(<RootError error={new Error("boom-secret-detail")} retry={retry} />);
  return retry;
}

// The root boundary catches what no nearer boundary catches: a failing route-group layout, a failing root not-found
// (marketing-landing SV-250, EP-10).
describe("the root error boundary (marketing-landing SV-250, EP-10)", () => {
  it.each(["/workspace/x", "/login", "/sign-up", "/verify-phone", "/account"])(
    "rootError_englishSection_english (%s)",
    (path) => {
      const retry = renderAt(path);

      const heading = screen.getByRole("heading", { level: 1, name: "Something went wrong" });
      expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
      expect(screen.getByText("The page could not be loaded. Please try again in a few minutes.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
    },
  );

  it.each(["/", "/list-with-us", "/khong-co-trang-nay"])("rootError_publicPath_vietnamese (%s)", (path) => {
    renderAt(path);

    const heading = screen.getByRole("heading", { level: 1, name: "Đã có lỗi xảy ra" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("vi");
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toBeTruthy();
  });

  it.each(["/", "/workspace/x"])("rootError_neverShowsTheError (%s)", (path) => {
    renderAt(path);

    expect(document.body.textContent).not.toContain("boom-secret-detail");
  });

  it("rootError_importsNoMessagesFile: no messages file in every route's client bundle", () => {
    const sources = ["./error.tsx", "../components/layout/route-site-error-panel.tsx"].map((file) =>
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
    );

    for (const source of sources) expect(source).not.toMatch(/messages\/(?:vi|en)\.json/);
  });
});
