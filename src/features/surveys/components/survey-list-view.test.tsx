import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { SurveyPage } from "../types";

// Edges only: the URL (a SALE on "My Surveys", already normalized), the signed-in user, and the list call.
const { router, session } = vi.hoisted(() => {
  const user = {
    userId: "u-sale",
    fullName: "Lan Nguyen",
    username: null,
    roles: ["SALE"],
    phoneVerified: true,
    emailVerified: true,
    requiredAction: null,
  };
  return { router: { replace: () => undefined }, session: { status: "signed-in", user } };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/surveys",
  useSearchParams: () => new URLSearchParams("scope=mine"),
  useRouter: () => router,
}));

vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  useSession: (): SessionSnapshot => session as SessionSnapshot,
}));

vi.mock("../services/surveys-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/surveys-api")>()),
  listSurveys: vi.fn(),
}));

import { listSurveys } from "../services/surveys-api";

import { SurveyListView } from "./survey-list-view";

const EMPTY: ApiResult<SurveyPage> = { ok: true, status: 200, replayed: false, data: { items: [], page: 0, size: 20, totalElements: 0 } };

const failed = (status: number): ApiResult<SurveyPage> => ({
  ok: false,
  kind: "http",
  status,
  fieldErrors: [],
  correlationId: "c0ffee12",
});

/** The workspace layout's provider: English messages (C-41). */
function renderList() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <SurveyListView />
    </NextIntlClientProvider>,
  );
}

describe("SurveyListView", () => {
  beforeEach(() => {
    vi.mocked(listSurveys).mockReset();
  });

  it("shows a loading state while the list is on its way", async () => {
    vi.mocked(listSurveys).mockReturnValue(new Promise(() => undefined));

    renderList();

    expect((await screen.findByRole("status")).textContent).toContain("Loading surveys…");
    expect(screen.getByRole("link", { name: "My Surveys" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says there is nothing scheduled when the list is empty", async () => {
    vi.mocked(listSurveys).mockResolvedValue(EMPTY);

    renderList();

    expect(await screen.findByText("You have no scheduled surveys.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the error with its support code, and Try again reads the list again", async () => {
    vi.mocked(listSurveys).mockResolvedValueOnce(failed(500)).mockResolvedValueOnce(EMPTY);

    renderList();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the surveys.");
    expect(alert.textContent).toContain("Support code: c0ffee12");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("You have no scheduled surveys.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells a viewer the server refuses that they may not see these surveys", async () => {
    vi.mocked(listSurveys).mockResolvedValue(failed(403));

    renderList();

    expect((await screen.findByRole("alert")).textContent).toContain("You are not allowed to see these surveys.");
  });
});
