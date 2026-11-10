import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { TestEnvironmentNotice } from "./test-environment-notice";

// W35a plan D-10 (copy by Claude, 2026-11-10), and its plain English equivalent for the screens that are English.
const VIETNAMESE = "Môi trường thử nghiệm của Sunvibe. Chỉ dùng dữ liệu giả; dữ liệu có thể bị xóa bất cứ lúc nào.";
const ENGLISH = "Sunvibe test environment. Use fake data only; data may be deleted at any time.";
const TEST_SITE = "https://test.sunvibe.vn";

function renderAt(pathname: string, siteUrl: string) {
  navigation.pathname = pathname;
  return render(<TestEnvironmentNotice siteUrl={siteUrl} />);
}

describe("TestEnvironmentNotice (W35a Task U1, D-10)", () => {
  // No screen mixes languages (G2 D-48): the public pages are Vietnamese.
  it.each(["/", "/list-with-us", "/nowhere", "/accounts", "/workspaces", "/login-help"])(
    "testBanner_nonProductionSite_shown (%s): the Vietnamese text on a public page",
    (pathname) => {
      renderAt(pathname, TEST_SITE);

      const notice = screen.getByRole("note");
      expect(notice.textContent).toBe(VIETNAMESE);
      expect(notice.getAttribute("lang")).toBe("vi");
    },
  );

  // The staff workspace (C-41, D-48), and the auth, onboarding and account screens, English until the translation wave
  // (D-48: "/login and /account stay English as today").
  it.each([
    "/workspace",
    "/workspace/owner-leads/123",
    "/login",
    "/login/phone",
    "/sign-up",
    "/sign-up/details",
    "/forgot-password",
    "/reset-password",
    "/verify-phone",
    "/account",
    "/account/email",
  ])("testBanner_nonProductionSite_shown (%s): the English text on an English screen", (pathname) => {
    renderAt(pathname, TEST_SITE);

    const notice = screen.getByRole("note");
    expect(notice.textContent).toBe(ENGLISH);
    expect(notice.getAttribute("lang")).toBe("en");
  });

  it("testBanner_sticksToTheBottom: it never moves a header or the workspace drawer down", () => {
    renderAt("/", TEST_SITE);

    // The root layout renders it after the page: pinned to the bottom of the window while the page scrolls, and at the
    // end of the page once scrolled there, so it covers nothing (W35a review M-1).
    expect(screen.getByRole("note").className.split(" ")).toEqual(expect.arrayContaining(["sticky", "bottom-0"]));
  });

  it.each(["https://www.sunvibe.vn", "https://www.sunvibe.vn/", "https://WWW.sunvibe.vn"])(
    "testBanner_productionSite_absent (%s)",
    (siteUrl) => {
      const { container } = renderAt("/", siteUrl);

      expect(container.innerHTML).toBe("");
    },
  );
});
