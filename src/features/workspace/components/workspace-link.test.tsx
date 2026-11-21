import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/features/auth/client";
import viMessages from "@/i18n/messages/vi.json";

// The edge only: the session of this tab, read where RequireRole and the entry links read it (E06S4-P14).
const { session } = vi.hoisted(() => ({ session: { current: { status: "signed-out", user: null } as SessionSnapshot } }));

vi.mock("@/features/auth/session/use-session", () => ({ useSession: (): SessionSnapshot => session.current }));

import { WorkspaceLink } from "./workspace-link";

const signedIn = (roles: string[]): SessionSnapshot => ({
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
});

function renderLink(snapshot: SessionSnapshot) {
  session.current = snapshot;
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <WorkspaceLink />
    </NextIntlClientProvider>,
  );
}

describe("WorkspaceLink: the public header's way into the workspace, unchanged by E06-S4 (E06S4-D16, pin (a))", () => {
  it("workspaceLink_saleSignedIn_linkToOwnerLeads: a signed-in SALE sees the link, leading to the lead list", () => {
    renderLink(signedIn(["SALE"]));

    const link = screen.getByRole("link", { name: viMessages.WorkspaceEntry.link });
    expect(link.getAttribute("href")).toBe("/workspace/owner-leads");
  });

  it("workspaceLink_customerReviewerOnlyOrSignedOut_none: a CUSTOMER, a user whose only role is LISTING_REVIEWER and a signed-out visitor see no link", () => {
    for (const snapshot of [signedIn(["CUSTOMER"]), signedIn(["LISTING_REVIEWER"]), { status: "signed-out", user: null } as SessionSnapshot]) {
      const { unmount } = renderLink(snapshot);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByText(viMessages.WorkspaceEntry.link)).toBeNull();
      unmount();
    }
  });
});
