import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { RouteSiteErrorPanel } from "./route-site-error-panel";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

function goTo(path: string) {
  window.history.pushState({}, "", path);
}

describe("RouteSiteErrorPanel: the error panel in the language of its screen (marketing-landing SV-250, G2 D-48)", () => {
  it.each(["/workspace/x", "/login", "/account"])("routeSiteErrorPanel_englishSection_english (%s)", (path) => {
    goTo(path);

    render(<RouteSiteErrorPanel retry={() => {}} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Something went wrong" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });

  it.each(["/", "/list-with-us"])("routeSiteErrorPanel_publicPath_vietnamese (%s)", (path) => {
    goTo(path);

    render(<RouteSiteErrorPanel retry={() => {}} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Đã có lỗi xảy ra" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("vi");
  });

  it("routeSiteErrorPanel_serverRender_vietnamese: the first HTML is Vietnamese on an English path", () => {
    goTo("/workspace/x");

    const html = renderToString(<RouteSiteErrorPanel retry={() => {}} />);

    expect(html).toMatch(/<h1[^>]*>Đã có lỗi xảy ra<\/h1>/);
    expect(html).not.toContain("Something went wrong");
  });
});
