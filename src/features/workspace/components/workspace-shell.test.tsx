import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RequireRole, type SessionSnapshot } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edges only (E06S4-P14): the address, the session of this tab where RequireRole reads it, and the session screens,
// the sign-out and the document check, whose cookie, session API and page-reload work is not what these tests hold.
// RequireRole, hasAnyRole, workspaceNav, WorkspaceNav and the Forbidden screen are the real ones.
const { navigation, session } = vi.hoisted(() => ({
  navigation: { pathname: "/workspace/owner-leads" },
  session: { current: { status: "signed-out", user: null } as SessionSnapshot },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
}));

vi.mock("@/features/auth/session/use-session", () => ({ useSession: (): SessionSnapshot => session.current }));

vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  RequireSession: ({ children }: { children: ReactNode }) => children,
  useSignOutHere: () => () => undefined,
}));

vi.mock("./workspace-document", () => ({ WorkspaceDocument: ({ children }: { children: ReactNode }) => children }));

import { WorkspaceShell } from "./workspace-shell";

const FORBIDDEN_TITLE = en.Session.forbidden.title;
const MENU = en.Workspace.menu.label;
const SIGN_OUT = en.Workspace.header.signOut;

function showAs(roles: string[], pathname: string, page: ReactNode = <h1>Stub page</h1>) {
  navigation.pathname = pathname;
  session.current = {
    status: "signed-in",
    user: {
      userId: "u-1",
      fullName: "Lan Nguyen",
      username: null,
      roles,
      phoneVerified: true,
      emailVerified: true,
      requiredAction: null,
    },
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <WorkspaceShell>{page}</WorkspaceShell>
    </NextIntlClientProvider>,
  );
}

const menuLinks = () => within(screen.getByRole("navigation", { name: MENU })).getAllByRole("link").map((link) => link.textContent);

describe("WorkspaceShell: the gate, the frame and the page (acquisition-owner-lead-queue-ui; E06S4-D16 pins)", () => {
  it("workspaceShell_customerAtOwnerLeads_forbiddenWithoutFrame: a CUSTOMER gets the 403 screen with no header, no menu, no Sign Out and no page", () => {
    showAs(["CUSTOMER"], "/workspace/owner-leads");

    expect(screen.getByText(FORBIDDEN_TITLE)).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation", { name: MENU })).toBeNull();
    expect(screen.queryByRole("button", { name: SIGN_OUT })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Stub page" })).toBeNull();
  });

  it("workspaceShell_saleAtOwnerLeads_frameFourItemsAndPage: a SALE gets the header with Sign Out, the menu's four links in order and the page inside main", () => {
    showAs(["SALE"], "/workspace/owner-leads");

    expect(within(screen.getByRole("banner")).getByRole("button", { name: SIGN_OUT })).toBeTruthy();
    expect(menuLinks()).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS"]);
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1, name: "Stub page" })).toBeTruthy();
    expect(screen.queryByText(FORBIDDEN_TITLE)).toBeNull();
  });

  it("workspaceShell_leaderAtTerritories_frameAndPageOwnForbidden: a SALE_LEADER at the territories page gets the frame and the page's own 403 screen inside main", () => {
    showAs(
      ["SALE_LEADER"],
      "/workspace/settings/territories",
      <RequireRole anyOf={["ADMIN"]}>
        <h1>Territories stub</h1>
      </RequireRole>,
    );

    expect(within(screen.getByRole("banner")).getByRole("button", { name: SIGN_OUT })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: MENU })).toBeTruthy();
    expect(within(screen.getByRole("main")).getByText(FORBIDDEN_TITLE)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Territories stub" })).toBeNull();
  });
});

describe("WorkspaceShell for a user whose only workspace role is LISTING_REVIEWER (listing-publish E06-S4, E06S4-D16)", () => {
  it("workspaceShell_reviewerOnlyAtOwnerLeads_frameOneItemForbidden: the frame with LISTING REVIEWS alone and the 403 screen inside main, no page", () => {
    showAs(["LISTING_REVIEWER"], "/workspace/owner-leads");

    expect(within(screen.getByRole("banner")).getByRole("button", { name: SIGN_OUT })).toBeTruthy();
    expect(menuLinks()).toEqual(["LISTING REVIEWS"]);
    expect(within(screen.getByRole("main")).getByText(FORBIDDEN_TITLE)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Stub page" })).toBeNull();
  });

  it("workspaceShell_reviewerOnlyAtReviewQueue_page: the frame and the page at the review queue", () => {
    showAs(["LISTING_REVIEWER"], "/workspace/listings/reviews");

    expect(within(screen.getByRole("banner")).getByRole("button", { name: SIGN_OUT })).toBeTruthy();
    expect(menuLinks()).toEqual(["LISTING REVIEWS"]);
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1, name: "Stub page" })).toBeTruthy();
    expect(screen.queryByText(FORBIDDEN_TITLE)).toBeNull();
  });
});
