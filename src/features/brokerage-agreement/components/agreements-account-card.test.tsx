import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgreementsAccountCard } from "./agreements-account-card";

describe("AgreementsAccountCard (brokerage-agreement E05-S5, S5-D17, UO-1)", () => {
  it("agreementsAccountCard_render_headingAndLink: the /account card names the agreements and links to the owner's page, with a link text of its own", () => {
    render(<AgreementsAccountCard />);

    expect(screen.getByRole("heading", { level: 2, name: "Brokerage agreements" })).toBeTruthy();
    expect(screen.getByText("Read the brokerage agreements Sunvibe sent you, and confirm or decline them.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open your agreements" });
    expect(link.getAttribute("href")).toBe("/account/brokerage-agreements");
    // The property confirmations card's link is found by this exact name in E2E; this card never uses it.
    expect(screen.queryByRole("link", { name: "Open your requests" })).toBeNull();
  });
});
