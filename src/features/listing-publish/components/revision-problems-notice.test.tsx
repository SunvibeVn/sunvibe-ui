import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { problemSentence } from "../lib/revision-text";

import { RevisionProblemsNotice } from "./revision-problems-notice";

const r = en.ListingPublish.revision;

const PROBLEMS = [
  { part: "TITLE", rule: "TOO_SHORT" },
  { part: "DESCRIPTION", rule: "PHONE_NUMBER" },
  { part: "TERMS", rule: "REQUIRED" },
  { part: "PHOTOS", rule: "TOO_FEW" },
].map(problemSentence);

function renderNotice(focusOnMount: boolean, problems = PROBLEMS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <button type="button">Elsewhere</button>
      <RevisionProblemsNotice heading={r.problems.heading} problems={problems} focusOnMount={focusOnMount} />
    </NextIntlClientProvider>,
  );
}

describe("RevisionProblemsNotice (listing-publish E06-S2, spec section 6, RD-15)", () => {
  it("revisionProblemsNotice_problems_oneSentenceEach: the heading and one list item per problem, each its sentence, in order", () => {
    renderNotice(false);

    expect(screen.getByText(r.problems.heading)).toBeTruthy();
    const list = screen.getByRole("list", { name: r.problems.heading });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "The title needs at least 15 characters.",
      "The description holds what reads as a phone number.",
      "Take a terms snapshot.",
      "This revision breaks a rule this page does not know yet.",
    ]);
    // Without focusOnMount the focus stays where it is.
    expect(document.activeElement).toBe(document.body);
  });

  it("revisionProblemsNotice_focusOnMount_listFocused: for the 422 the list takes the focus when it appears; an empty list shows nothing", () => {
    renderNotice(true);
    expect(document.activeElement).toBe(screen.getByRole("list", { name: r.problems.heading }));
  });

  it("revisionProblemsNotice_empty_nothing: no problems render nothing", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <RevisionProblemsNotice heading={r.problems.heading} problems={[]} focusOnMount />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe("");
  });
});
