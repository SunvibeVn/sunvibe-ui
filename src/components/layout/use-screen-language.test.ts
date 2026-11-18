// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useScreenLanguage } from "./use-screen-language";

// A .test.ts file in jsdom, without JSX: naming-layout.test.ts reads every use-*.tsx file but *.test.ts as a hook file.
// The node project has no `globals: true`, so this file sets React's act environment and cleans up itself.

function Probe() {
  return createElement("span", null, useScreenLanguage());
}

const roots: Root[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  cleanup();
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

describe("useScreenLanguage: the screen language, read after hydration (marketing-landing SV-250)", () => {
  it.each([
    ["/workspace/x", "en"],
    ["/login", "en"],
    ["/", "vi"],
    ["/khong-co-trang-nay", "vi"],
  ])("useScreenLanguage_afterMount_followsThePath (%s)", (path, expected) => {
    goTo(path);

    render(createElement(Probe));

    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("useScreenLanguage_serverRender_vietnamese: the server snapshot, though jsdom has a window", () => {
    goTo("/workspace/x");

    const html = renderToString(createElement(Probe));

    expect(html).toContain("vi");
    expect(html).not.toContain("en");
  });

  it("useScreenLanguage_hydratesThenSwitches_noMismatch: rendered at /_not-found, hydrated at an English path", () => {
    goTo("/_not-found");
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error");

    goTo("/workspace/x");
    act(() => {
      roots.push(hydrateRoot(container, createElement(Probe), { onRecoverableError }));
    });

    expect(container.textContent).toBe("en");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(" ")))).toEqual([]);
  });
});
