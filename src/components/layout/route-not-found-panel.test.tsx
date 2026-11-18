import { render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import viMessages from "@/i18n/messages/vi.json";

import { RouteNotFoundPanel } from "./route-not-found-panel";

const roots: Root[] = [];

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

function goTo(path: string) {
  window.history.pushState({}, "", path);
}

const panel = () => <RouteNotFoundPanel vietnamese={viMessages.NotFound} english={en.NotFound} />;

describe("RouteNotFoundPanel: the 404 in the language of its screen (marketing-landing SV-250, G2 D-48)", () => {
  it.each(["/workspace/no-such-page", "/login/phone", "/account/x"])(
    "routeNotFoundPanel_englishSection_english (%s)",
    (path) => {
      goTo(path);

      render(panel());

      const heading = screen.getByRole("heading", { level: 1, name: "Page not found" });
      expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
      expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
    },
  );

  it.each(["/no-such-page", "/properties/x", "/workspaces"])("routeNotFoundPanel_publicPath_vietnamese (%s)", (path) => {
    goTo(path);

    render(panel());

    const heading = screen.getByRole("heading", { level: 1, name: "Không tìm thấy trang" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("vi");
  });

  it("routeNotFoundPanel_serverRender_vietnamese: the first HTML is Vietnamese on an English path", () => {
    goTo("/workspace/no-such-page");

    const html = renderToString(panel());

    expect(html).toMatch(/<h1[^>]*>Không tìm thấy trang<\/h1>/);
    expect(html).toContain('lang="vi"');
    expect(html).not.toMatch(/<h1[^>]*>Page not found/);
  });

  it("routeNotFoundPanel_hydratesAtEnglishSection_noMismatch: prerendered at /_not-found, hydrated at /workspace/...", () => {
    goTo("/_not-found");
    const container = document.createElement("div");
    container.innerHTML = renderToString(panel());
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error");

    goTo("/workspace/no-such-page");
    act(() => {
      roots.push(hydrateRoot(container, panel(), { onRecoverableError }));
    });

    const heading = screen.getByRole("heading", { level: 1, name: "Page not found" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(" ")))).toEqual([]);
  });
});
