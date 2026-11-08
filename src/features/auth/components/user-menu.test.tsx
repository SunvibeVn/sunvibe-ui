import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the cookie read is replaced: the hint cookie comes from `next/headers`, which needs a request.
vi.mock("../session/hint.server", () => ({ hasSignInHint: vi.fn() }));

import { hasSignInHint } from "../session/hint.server";

import { UserMenuLink } from "./user-menu";

// `UserMenu` wraps this async component in Suspense; jsdom cannot render an async component, so the test awaits it
// and renders the link it returns (W34 Task I2).
describe("UserMenu", () => {
  beforeEach(() => {
    vi.mocked(hasSignInHint).mockReset();
  });

  it("offers Log in to a visitor with no sign-in hint", async () => {
    vi.mocked(hasSignInHint).mockResolvedValue(false);

    render(await UserMenuLink());

    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
  });

  it("offers Account when the browser holds the sign-in hint", async () => {
    vi.mocked(hasSignInHint).mockResolvedValue(true);

    render(await UserMenuLink());

    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });
});
