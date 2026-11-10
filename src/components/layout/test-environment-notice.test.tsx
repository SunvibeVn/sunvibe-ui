import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { TestEnvironmentNotice } from "./test-environment-notice";

// W35a plan D-10 (copy by Claude, 2026-11-10), and its plain English equivalent for the English staff workspace (C-41).
const VIETNAMESE = "Môi trường thử nghiệm của Sunvibe. Chỉ dùng dữ liệu giả; dữ liệu có thể bị xóa bất cứ lúc nào.";
const ENGLISH = "Sunvibe test environment. Use fake data only; data may be deleted at any time.";
const TEST_SITE = "https://test.sunvibe.vn";

function renderAt(pathname: string, siteUrl: string) {
  navigation.pathname = pathname;
  return render(<TestEnvironmentNotice siteUrl={siteUrl} />);
}

describe("TestEnvironmentNotice (W35a Task U1, D-10)", () => {
  it.each(["/", "/login", "/sign-up", "/list-with-us", "/account", "/workspaces", "/nowhere"])(
    "testBanner_nonProductionSite_shown (%s): the Vietnamese text",
    (pathname) => {
      renderAt(pathname, TEST_SITE);

      const notice = screen.getByRole("note");
      expect(notice.textContent).toBe(VIETNAMESE);
      expect(notice.getAttribute("lang")).toBe("vi");
    },
  );

  it.each(["/workspace", "/workspace/owner-leads/123"])(
    "testBanner_nonProductionSite_shown (%s): the English text in the workspace (C-41)",
    (pathname) => {
      renderAt(pathname, TEST_SITE);

      const notice = screen.getByRole("note");
      expect(notice.textContent).toBe(ENGLISH);
      expect(notice.getAttribute("lang")).toBe("en");
    },
  );

  it.each(["https://www.sunvibe.vn", "https://www.sunvibe.vn/", "https://WWW.sunvibe.vn"])(
    "testBanner_productionSite_absent (%s)",
    (siteUrl) => {
      const { container } = renderAt("/", siteUrl);

      expect(container.innerHTML).toBe("");
    },
  );
});
