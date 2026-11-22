import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/features/auth/client";

// The edge only: the session of this tab, read where RequireRole and the entry links read it (E06S4-P14).
const { session } = vi.hoisted(() => ({ session: { current: { status: "signed-out", user: null } as SessionSnapshot } }));

vi.mock("@/features/auth/session/use-session", () => ({ useSession: (): SessionSnapshot => session.current }));

import { WorkspaceAccountCard } from "./workspace-account-card";

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

function renderCard(snapshot: SessionSnapshot) {
  session.current = snapshot;
  return render(<WorkspaceAccountCard />);
}

describe("WorkspaceAccountCard: the /account card into the workspace, unchanged by E06-S4 (E06S4-D16, pin (b))", () => {
  it("workspaceAccountCard_saleSignedIn_cardToOwnerLeads: a signed-in SALE sees the card, whose link leads to the lead list", () => {
    renderCard(signedIn(["SALE"]));

    expect(screen.getByRole("heading", { level: 2, name: "Workspace" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open workspace" });
    expect(link.getAttribute("href")).toBe("/workspace/owner-leads");
  });

  it("workspaceAccountCard_customerReviewerOnlyOrSignedOut_none: a CUSTOMER, a user whose only role is LISTING_REVIEWER and a signed-out visitor see no card", () => {
    for (const snapshot of [signedIn(["CUSTOMER"]), signedIn(["LISTING_REVIEWER"]), { status: "signed-out", user: null } as SessionSnapshot]) {
      const { container, unmount } = renderCard(snapshot);
      expect(container.innerHTML).toBe("");
      expect(screen.queryByRole("link")).toBeNull();
      unmount();
    }
  });
});
