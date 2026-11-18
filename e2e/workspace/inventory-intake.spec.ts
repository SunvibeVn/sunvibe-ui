import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { CUSTOMER, expectSignedInAccount } from "../support/auth";
import {
  DESKTOP,
  detailHeader,
  expectListPage,
  fixture,
  historySection,
  mainArea,
  newStaffContext,
  openLead,
  PHONE,
  recordApiCalls,
  signInAs,
  T,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Inventory intake from a surveyed lead (property-create intake spec 6; U-1..U-10). The flow in one line: the SALE selects
// the parts and asks for the owner, the owner confirms on their own account page, E2E Admin starts the check and the owner
// enters the phrase, then the SALE creates the property, records availability, reads the preview and completes. Answers
// changed in the browser: a stale previewHash. Budget: 4 logins (SALE, CUSTOMER, ADMIN, and SALE_LEADER in the agreement list
// test), and 5 of the 10 owner POSTs an IP may
// send in 15 minutes, which only a restart of the API resets: a second run in a row can meet the limit. No trace, video or screenshot in
// this project (playwright.workspace.config.ts): the code, the phrase and the password must not land in a file.
//
// Runs after survey-checklist-review, from L15's end state: QUALIFIED with a real PASSED. `requalification` runs after it,
// on the same lead. A re-run of the lead seed clears what an intake left, the property included.

test.describe.configure({ mode: "serial", timeout: 120_000 });

const L15 = fixture.lead(15);
const ACCOUNT_PAGE = "/account/property-confirmations";
const INTAKE_PAGE = `/workspace/owner-leads/${L15.id}/inventory-intake`;

const NOTE = "The owner said it is vacant";

const I = {
  section: "Inventory intake",
  open: "Open the intake",
  parts: "Parts",
  saveParts: "Save the selection",
  ownerEmail: "Owner's email",
  ask: "Create the request",
  waiting: "Waiting for the owner, until the request ends.",
  read: "I've read it out",
  checkPanel: "Owner check by a manager",
  checkWaits: "A manager has to call the owner before this goes on.",
  create: "Create a new property",
  saveTarget: "Save the target",
  saveAvailability: "Save availability",
  complete: "Complete the intake",
  stale: "The preview was out of date. Read the new one before completing.",
  moved: "Something changed on this intake. The page has been reloaded.",
  result: "Result",
} as const;

/** Crockford base32, as the server draws them. */
const CODE = /^[0-9A-Z]{8}$/;
const PHRASE = /^[0-9A-Z]{6}$/;

const BLOCK_READ = /\/inventory-intake$/;
const AVAILABILITY_SAVE = /\/inventory-intake\/availability$/;
const PREVIEW_READ = /\/inventory-intake\/preview$/;
const COMPLETION = /\/inventory-intake\/completion$/;
const OWNER_CHECK_CONTEXT = /\/inventory-intake\/owner-check-context$/;
const SURVEY_TERMS = /\/brokerage-agreements\/[0-9A-Z]{26}\/survey-terms$/;

const step = (page: Page, name: string): Locator => mainArea(page).getByRole("region", { name, exact: true });
const button = (scope: Page | Locator, name: string): Locator => scope.getByRole("button", { name, exact: true });

/** Records the same answer for every part. */
async function fillAvailability(availability: Locator): Promise<void> {
  const states = availability.getByLabel("State");
  const notes = availability.getByLabel("Note");
  for (let index = 0; index < (await states.count()); index += 1) {
    await states.nth(index).selectOption("VACANT");
    await notes.nth(index).fill(NOTE);
  }
}

/** On a phone the page must not scroll sideways: a long code, address or button stays inside it. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.setViewportSize(DESKTOP);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Everything this tab keeps in storage, as one string. */
const storedText = (page: Page): Promise<string> =>
  page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));

test.describe("Inventory intake from a surveyed lead (property-create intake W21b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let ownerContext: BrowserContext;
  let owner: Page;
  let adminContext: BrowserContext;
  let admin: Page;
  let code = "";
  let phrase = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    saleContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP });
    sale = await saleContext.newPage();
    ownerContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP });
    owner = await ownerContext.newPage();
    adminContext = await newStaffContext(browser);
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await saleContext?.close();
    await ownerContext?.close();
    await adminContext?.close();
  });

  test("U-7, U-1: the lead shows the section, and the page offers the parts of a passed survey", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    await openLead(sale, L15);
    await expect(detailHeader(sale)).toContainText("Qualified", { timeout: 20_000 });

    const section = step(sale, I.section);
    await expect(section).toContainText("Not started");
    await section.getByRole("link", { name: I.open, exact: true }).click();
    await expect(sale.getByRole("heading", { level: 1, name: "Inventory intake" })).toBeVisible();
    await expect(step(sale, I.parts).getByRole("checkbox").first()).toBeVisible();
  });

  test("selection: a whole selection saves, and the owner step follows", async () => {
    const parts = step(sale, I.parts);
    const boxes = parts.getByRole("checkbox");
    for (let index = 0; index < (await boxes.count()); index += 1) {
      const box = boxes.nth(index);
      if ((await box.isEnabled()) && !(await box.isChecked())) await box.check();
    }
    await button(parts, I.saveParts).click();
    await expect(step(sale, "Owner confirmation").getByLabel(I.ownerEmail)).toBeVisible();
  });

  test("U-2: the code shows once, sits in no storage, and is gone on reload", async () => {
    const ownerStep = step(sale, "Owner confirmation");
    await ownerStep.getByLabel(I.ownerEmail).fill(CUSTOMER.email);
    await button(ownerStep, I.ask).click();

    const shown = ownerStep.getByText(CODE);
    await expect(shown).toBeVisible();
    code = (await shown.textContent()) ?? "";
    await expect(ownerStep).toContainText(I.waiting);
    expect(await storedText(sale)).not.toContain(code);
    expect(sale.url()).not.toContain(code);

    // Leaving for another site can keep the page whole for Back: the code goes in that same moment, not later.
    const onScreen = await sale.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      return document.body.innerText;
    });
    expect(onScreen).not.toContain(code);

    await sale.reload();
    await expect(sale.getByRole("heading", { level: 1, name: "Inventory intake" })).toBeVisible({ timeout: 20_000 });
    await expect(step(sale, "Owner confirmation")).toContainText(I.waiting);
    await expect(step(sale, "Owner confirmation").getByText(CODE)).toHaveCount(0);
  });

  test("U-8, U-9: before the code the owner sees only the request; a wrong password says so; the right one confirms", async () => {
    await signInAs(owner, "CUSTOMER");
    await expectSignedInAccount(owner);
    await owner.getByRole("link", { name: "Open your requests", exact: true }).click();
    await expect(owner).toHaveURL(new RegExp(`${ACCOUNT_PAGE}$`));

    const request = owner.getByRole("listitem").filter({ hasText: "A request to confirm a property" });
    await expect(request).toContainText("It ends");
    await expect(request.getByText("Address", { exact: true })).toHaveCount(0);

    await request.getByLabel("Confirmation code").fill(code);
    await button(request, "See the details").click();
    await expect(request.getByText("What you confirm", { exact: true })).toBeVisible();
    await expect(request.getByText("Address", { exact: true })).toBeVisible();
    await expectNoSidewaysScroll(owner);

    await request.getByLabel("Your password").fill("not-the-password");
    await button(request, "Confirm").click();
    await expect(request.getByText("That password isn't right.", { exact: true })).toBeVisible();

    // A password manager submits with no button: the form must still stay out of a native GET.
    await request.getByLabel("Your password").fill("not-the-password");
    await request.getByLabel("Your password").evaluate((field: HTMLInputElement) => field.form?.requestSubmit());
    await expect(request.getByText("That password isn't right.", { exact: true })).toBeVisible();
    expect(owner.url()).not.toContain("not-the-password");

    await request.getByLabel("Your password").fill(CUSTOMER.password ?? "");
    await button(request, "Confirm").click();
    await expect(owner.getByText("Thank you. Your confirmation is saved.", { exact: true })).toBeVisible();
    await expect(owner.getByRole("heading", { name: "A property you confirmed", exact: true })).toBeVisible();
    await expect(owner.getByLabel("Phrase")).toHaveCount(0);
    expect(await storedText(owner)).not.toContain(code);
  });

  test("U-6: the SALE waits for the check and never reads its context", async () => {
    const calls = recordApiCalls(sale);
    await sale.reload();
    await expect(step(sale, "Owner check")).toContainText(I.checkWaits, { timeout: 20_000 });
    await expect(step(sale, I.checkPanel)).toHaveCount(0);
    expect(calls.some((call) => OWNER_CHECK_CONTEXT.test(call.url.pathname))).toBe(false);
  });

  test("U-6: the manager reads the context and gets the phrase once, with the meaning of the script", async () => {
    await signInAs(admin, "ADMIN");
    await expectSignedInAccount(admin);
    await admin.goto(INTAKE_PAGE);

    const panel = step(admin, I.checkPanel);
    await expect(panel.getByText("Signals", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText("e***");
    await panel.getByLabel("Basis").fill("The lead's phone is the owner's, checked against the survey");
    await button(panel, "Start the check").click();

    const shown = panel.getByText(PHRASE);
    await expect(shown).toBeVisible();
    phrase = (await shown.textContent()) ?? "";
    await expect(panel).toContainText("Please enter this code yourself on your Sunvibe account page.");
    expect(await storedText(admin)).not.toContain(phrase);

    await button(panel, I.read).click();
    await expect(panel.getByText(PHRASE)).toHaveCount(0);
  });

  test("U-10: the owner enters the phrase the caller read out; no screen shows it", async () => {
    await button(owner, "Check again").click();
    const field = owner.getByLabel("Phrase");
    await expect(field).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(owner)).not.toContainText(phrase);
    await field.fill(phrase);
    await button(owner, "Enter the phrase").click();
    await expect(owner.getByText("Thank you. The phrase is saved.", { exact: true })).toBeVisible();
    await expect(owner.getByLabel("Phrase")).toHaveCount(0);
    expect(await storedText(owner)).not.toContain(phrase);
  });

  test("target: the SALE creates a new property", async () => {
    await sale.reload();
    const target = step(sale, "Target");
    await expect(target).toBeVisible({ timeout: 20_000 });
    await target.getByRole("radio", { name: I.create, exact: true }).check();
    const main = target.getByLabel("Main part");
    if ((await main.count()) > 0) await main.selectOption({ index: 1 });
    await button(target, I.saveTarget).click();
    await expect(step(sale, "Availability")).toBeVisible();
  });

  test("a save refused as stale keeps what was typed and says why, though the block moved on", async () => {
    const availability = step(sale, "Availability");
    await fillAvailability(availability);
    await sale.route(
      AVAILABILITY_SAVE,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "CONCURRENT_MODIFICATION", message: "x", errors: [] }),
        }),
      { times: 1 },
    );
    await sale.route(
      BLOCK_READ,
      async (route) => {
        const response = await route.fetch();
        const block = (await response.json()) as { version: number };
        await route.fulfill({ response, json: { ...block, version: block.version + 1 } });
      },
      { times: 1 },
    );
    await button(availability, I.saveAvailability).click();
    await expect(mainArea(sale).getByText(I.moved, { exact: true })).toBeVisible();
    await expect(availability.getByLabel("Note").first()).toHaveValue(NOTE);
    await expect(availability.getByLabel("State").first()).toHaveValue("VACANT");
    await sale.reload();
    await expect(step(sale, "Availability")).toBeVisible({ timeout: 20_000 });
  });

  test("availability: the SALE records what the owner said", async () => {
    const availability = step(sale, "Availability");
    await fillAvailability(availability);
    await button(availability, I.saveAvailability).click();
    await expect(step(sale, "Preview").getByRole("button", { name: I.complete, exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("U-4: the preview shows the owner, the sources and what is not carried", async () => {
    const preview = step(sale, "Preview");
    await expect(preview).toContainText("Confirmed and checked");
    await expect(preview).toContainText("e***");
    await expect(preview).toContainText("Set at completion");
    await expect(preview.getByText("Not carried into inventory", { exact: true })).toBeVisible();
    await expect(preview).toContainText("Photos");
    await expectNoSidewaysScroll(sale);
  });

  test("U-3: a failed previewHash reads the preview again and keeps the form usable", async () => {
    let reads = 0;
    await sale.route(PREVIEW_READ, async (route) => {
      reads += 1;
      await route.continue();
    });
    await sale.route(
      COMPLETION,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "INTAKE_PREVIEW_STALE", message: "x", errors: [] }),
        }),
      { times: 1 },
    );
    const preview = step(sale, "Preview");
    await button(preview, I.complete).click();
    await expect(mainArea(sale).getByText(I.stale, { exact: true })).toBeVisible();
    await expect(button(preview, I.complete)).toBeEnabled();
    expect(reads).toBeGreaterThan(0);
    await sale.unroute(PREVIEW_READ);
  });

  test("U-5: a double click completes once, and the result reads as usable inventory", async () => {
    const calls = recordApiCalls(sale);
    await button(step(sale, "Preview"), I.complete).dblclick();

    const result = step(sale, I.result);
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(sale).getByText("The intake is completed.", { exact: true })).toBeVisible();
    await expect(result).toContainText("Usable");
    await expect(result).toContainText("Brokerage agreement");
    expect(calls.filter((call) => call.method === "POST" && COMPLETION.test(call.url.pathname))).toHaveLength(1);
  });

  test("the lead stays Qualified, and History names the event only", async () => {
    await sale.getByRole("link", { name: "Back to the lead", exact: true }).click();
    await expect(detailHeader(sale)).toContainText("Qualified", { timeout: 20_000 });
    await expect(step(sale, I.section)).toContainText("Completed");
    await expect(historySection(sale)).toContainText("Intake #1 completed");
  });

  test("eligibility_afterCompletion_unitCanGetAnAgreement (UI-5, brokerage-agreement US-1 AC-1)", async () => {
    // The fixture's Sale is the assignee; the owner is a non-staff account with the OWNER/UNVERIFIED row the completion writes.
    const eligibility = mainArea(sale).getByRole("region", { name: "Agreement eligibility", exact: true });
    await expect(eligibility).toBeVisible({ timeout: 20_000 });
    await expect(eligibility.getByRole("listitem")).toHaveCount(1, { timeout: 20_000 });
    await expect(eligibility.getByRole("listitem")).toContainText("Can get an agreement");
    await expect(eligibility).not.toContainText("Only the Sale assigned to this lead drafts an agreement.");
  });

  test("agreementDraft_fromTheLeadPage_opensItsPage (UI-7, brokerage-agreement US-1 AC-3, AC-4)", async () => {
    // On the lead page the previous test leaves open. The lead seed deletes the agreements of its leads, so this runs again
    // after a re-seed (brokerage-agreement S2-D16).
    const eligibility = mainArea(sale).getByRole("region", { name: "Agreement eligibility", exact: true });
    const unit = eligibility.getByRole("listitem");
    await button(unit, "Draft an agreement").click();
    const dialog = sale.getByRole("dialog", { name: "Draft an agreement", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Transaction type: Long-term rental");

    // A 13-month period is refused in the browser: nothing is sent.
    const calls = recordApiCalls(sale);
    const drafts = () => calls.filter((call) => call.method === "POST" && call.url.pathname === "/api/v1/staff/brokerage-agreements");
    await dialog.getByLabel("Start date", { exact: true }).fill("2027-01-01");
    await dialog.getByLabel("End date", { exact: true }).fill("2028-02-01");
    await button(dialog, "Create the draft").click();
    await expect(dialog.getByText("The end date is more than 12 months after the start date.", { exact: true })).toBeVisible();
    expect(drafts()).toHaveLength(0);

    // A double click creates one draft and lands on its page.
    await dialog.getByLabel("End date", { exact: true }).fill("2027-12-31");
    await button(dialog, "Create the draft").dblclick();
    await expect(sale).toHaveURL(/\/workspace\/brokerage-agreements\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    const agreementPath = new URL(sale.url()).pathname;

    const agreement = mainArea(sale);
    await expect(agreement.getByRole("heading", { level: 1, name: "Brokerage agreement", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    for (const text of ["Drafting", "Long-term rental", "Version 1", "Draft", "1 Jan 2027", "31 Dec 2027"]) {
      await expect(agreement.getByText(text, { exact: true })).toBeVisible();
    }
    expect(drafts()).toHaveLength(1);

    // Back on the lead, the unit has its agreement in progress and offers no second draft.
    await agreement.getByRole("link", { name: "Open the lead", exact: true }).click();
    await expect(sale).toHaveURL(new RegExp(`/workspace/owner-leads/${L15.id}$`), { timeout: 20_000 });
    await expect(unit).toContainText("Agreement in progress", { timeout: 20_000 });
    await expect(unit.getByRole("link", { name: "Open the agreement", exact: true })).toBeVisible();
    await expect(button(unit, "Draft an agreement")).toHaveCount(0);

    // A manager who may see the lead opens the same agreement from it (no new sign-in: the admin context of this spec).
    await admin.goto(`/workspace/owner-leads/${L15.id}`);
    const adminUnit = mainArea(admin).getByRole("region", { name: "Agreement eligibility", exact: true }).getByRole("listitem");
    await adminUnit.getByRole("link", { name: "Open the agreement", exact: true }).click({ timeout: 20_000 });
    await expect(admin).toHaveURL(new RegExp(`${agreementPath}$`), { timeout: 20_000 });
    await expect(mainArea(admin).getByText("Drafting", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(admin).getByText("Version 1", { exact: true })).toBeVisible();
  });

  // Brief E-1, stated in the eligibility region in every state it shows (brokerage-agreement S3-D19).
  const E1 =
    "Units created by the old direct property form, and survey parts left out of an intake, are not listed here. They need an intake or unit management first.";

  test("agreementTerms_editWithSurveyValues_savedAndReadOnly (UD-8, brokerage-agreement US-1 AC-1, AC-3, AC-5, E-1)", async () => {
    // On the lead page the previous test leaves open.
    const eligibility = mainArea(sale).getByRole("region", { name: "Agreement eligibility", exact: true });
    await expect(eligibility.getByText(E1, { exact: true })).toBeVisible({ timeout: 20_000 });
    await eligibility.getByRole("listitem").getByRole("link", { name: "Open the agreement", exact: true }).click();
    await expect(sale).toHaveURL(/\/workspace\/brokerage-agreements\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    const agreementPath = new URL(sale.url()).pathname;
    const agreement = mainArea(sale);

    // L15's PASSED revision holds no G8 value at this point of the chain (spec A-2, E05S3-P8), so every answer of the
    // survey reference is stubbed for this test: `next dev` mounts the panel twice (Strict Mode), and the first read is
    // dropped. ED-9 holds the server mapping on PostgreSQL.
    const proposal = {
      terms: {
        monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
        deposit: null,
        minimumTermMonths: 12,
        paymentPeriodMonths: 1,
        mandatoryFees: [{ name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" }],
      },
      sources: [
        { field: "monthlyRent", source: "OWNER_STATED", date: "2026-11-10" },
        { field: "minimumTermMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
        { field: "paymentPeriodMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
        { field: "mandatoryFees[0]", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
      ],
    };
    await sale.route(SURVEY_TERMS, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(proposal) }),
    );
    await button(agreement, "Edit the draft").click({ timeout: 20_000 });

    const survey = agreement.getByRole("region", { name: "Survey reference", exact: true });
    await expect(survey.getByText("Said by the owner", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(survey.getByText("10 Nov 2026", { exact: true })).toBeVisible();
    await button(survey, "Use the survey values").click();
    await expect(agreement.getByLabel("Monthly rent (VND)", { exact: true })).toHaveValue("8000000");
    await expect(agreement.getByText("From the survey: Said by the owner, 10 Nov 2026", { exact: true })).toBeVisible();
    await sale.unrouteAll({ behavior: "wait" });

    await agreement.getByLabel("Interior and common areas", { exact: true }).selectOption({ label: "Yes" });
    await expect(agreement.getByLabel("Exterior (front, entrance, street view)", { exact: true })).not.toBeChecked();
    await agreement.getByLabel("Deposit", { exact: true }).selectOption({ label: "Months of rent" });
    await agreement.getByLabel("Value", { exact: true }).fill("2");
    await button(agreement, "Add a fee").click();
    await agreement.getByLabel("Fee name", { exact: true }).nth(1).fill("Water");
    await agreement.getByLabel("Basis", { exact: true }).nth(1).selectOption({ label: "Provider's rate" });

    // A double click saves once, leaves edit mode and reads the agreement again.
    const calls = recordApiCalls(sale);
    await button(agreement, "Save the draft").dblclick();
    await expect(agreement.getByRole("heading", { name: "Editing the draft", exact: true })).toHaveCount(0, { timeout: 20_000 });
    const saved = [
      "Proposed terms: not confirmed by the owner yet.",
      "8,000,000 VND per month",
      "2 months' rent",
      "12 months",
      "Electricity: 3,500 VND per kWh",
      "Water: provider's rate",
    ];
    for (const text of saved) await expect(agreement.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(calls.filter((call) => call.method === "PUT" && call.url.pathname.endsWith("/draft"))).toHaveLength(1);

    // A manager reads the same content at the same address, and is offered no edit (brokerage-agreement BR-16).
    await admin.goto(agreementPath);
    for (const text of saved) await expect(mainArea(admin).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(button(mainArea(admin), "Edit the draft")).toHaveCount(0);
  });

  test("agreementSend_feePolicyThenSend_awaitingTheOwner (UF-6, brokerage-agreement US-1 AC-3, AC-5, BR-7, S4-D15)", async () => {
    // On the agreement page the previous test leaves open: its terms and consent are complete, its fee policy is not.
    // The dev profile has the BR-19 switch on (S4-D8); the owner's notice row is written, and no spec reads the mail.
    const agreementPath = new URL(sale.url()).pathname;
    const agreement = mainArea(sale);
    const sendDialog = sale.getByRole("dialog", { name: "Send this version to the owner", exact: true });
    const submissions = (calls: { method: string; url: URL }[]) =>
      calls.filter((call) => call.method === "POST" && call.url.pathname.endsWith("/draft/submission"));

    // Sending a version without its fee policy is refused with the five missing parts, in order; it stays a draft.
    await button(agreement, "Send to the owner").click({ timeout: 20_000 });
    await expect(sendDialog).toBeVisible();
    await button(sendDialog, "Send").click();
    await expect(sendDialog.getByText("This version cannot be sent yet. Missing:", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(sendDialog.getByRole("listitem")).toHaveText([
      "How the fee is set",
      "Payment due",
      "Lease renewed with the same tenant",
      "If the lease ends early",
      "Protection period",
    ]);
    await button(sendDialog, "Keep editing").click();
    await expect(sendDialog).toHaveCount(0);
    await expect(agreement.getByText("Drafting", { exact: true })).toBeVisible();
    await expect(agreement.getByText("Draft", { exact: true })).toBeVisible();

    // The Sale enters the fee policy: 50% from 1 month, 100% from 12 months, due 7 days, no renewal fee, no refund,
    // protection 90 days. One save.
    await button(agreement, "Edit the draft").click();
    await agreement.getByLabel("How the fee is set", { exact: true }).selectOption({ label: "Percentage of one month's rent" });
    await expect(agreement.getByLabel("Lease term from (months)", { exact: true })).toHaveValue("1");
    await agreement.getByLabel("Percentage of one month's rent (%)", { exact: true }).fill("50");
    await button(agreement, "Add a tier").click();
    await agreement.getByLabel("Lease term from (months)", { exact: true }).nth(1).fill("12");
    await agreement.getByLabel("Percentage of one month's rent (%)", { exact: true }).nth(1).fill("100");
    await agreement.getByLabel("Payment due (days after the lease is signed)", { exact: true }).fill("7");
    await agreement.getByLabel("Lease renewed with the same tenant", { exact: true }).selectOption({ label: "No fee" });
    await agreement.getByLabel("If the lease ends early", { exact: true }).selectOption({ label: "No refund" });
    await agreement.getByLabel("Protection period (days after this agreement ends)", { exact: true }).fill("90");
    const saves = recordApiCalls(sale);
    await button(agreement, "Save the draft").click();
    await expect(agreement.getByRole("heading", { name: "Editing the draft", exact: true })).toHaveCount(0, { timeout: 20_000 });
    const feeLines = [
      "Proposed fee policy: not confirmed by the owner yet.",
      "The owner",
      "When a lease is signed",
      "From a lease term of 1 month: 50% of one month's rent",
      "From a lease term of 12 months: 100% of one month's rent",
      "7 days after the lease is signed",
      "No fee",
      "No refund",
      "90 days after this agreement ends",
    ];
    for (const text of feeLines) await expect(agreement.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(saves.filter((call) => call.method === "PUT" && call.url.pathname.endsWith("/draft"))).toHaveLength(1);

    // A double click on Send sends one request, with the data version of the read after the save (Review Focus 4).
    const sends = recordApiCalls(sale);
    await button(agreement, "Send to the owner").click();
    await expect(sendDialog).toContainText(
      "Version 1 goes to the owner of this unit. After sending, it can no longer be edited. The owner gets an email that asks them to sign in and read it.",
    );
    await button(sendDialog, "Send").dblclick();
    await expect(sendDialog).toHaveCount(0, { timeout: 20_000 });
    const sentPage = [
      "Awaiting confirmation",
      "Awaiting the owner",
      "Proposed terms: not confirmed by the owner yet.",
      "Proposed fee policy: not confirmed by the owner yet.",
      "From a lease term of 12 months: 100% of one month's rent",
    ];
    for (const text of sentPage) await expect(agreement.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByText(/^Sent to the owner: /)).toBeVisible();
    await expect(button(agreement, "Edit the draft")).toHaveCount(0);
    await expect(button(agreement, "Send to the owner")).toHaveCount(0);
    expect(submissions(sends)).toHaveLength(1);

    // A manager reads the same at the same address, with no action (brokerage-agreement BR-16).
    await admin.goto(agreementPath);
    for (const text of sentPage) await expect(mainArea(admin).getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(mainArea(admin).getByText(/^Sent to the owner: /)).toBeVisible();
    await expect(button(mainArea(admin), "Edit the draft")).toHaveCount(0);
    await expect(button(mainArea(admin), "Send to the owner")).toHaveCount(0);
  });

  test("agreementOwner_declineNewDraftConfirm_answeredVersions (E2E-1, brokerage-agreement US-2 AC-1 to AC-3, BR-5, BR-17)", async () => {
    // The agreement page the previous test leaves open on the Sale's side; the owner is CUSTOMER, signed in at U-8 and the
    // declared owner of L15's intake (spec A-2: the owner step above asks CUSTOMER's email, and CUSTOMER confirms it).
    // Owner POSTs: one rejection and two confirmations, of the 10 per 15 minutes of the agreements' own bucket. One wrong
    // password only: the account's re-authentication counter is the one U-8 used.
    const agreementPath = new URL(sale.url()).pathname;
    const agreement = mainArea(sale);
    const ownerCard = owner.getByRole("listitem").filter({ has: owner.getByRole("heading", { level: 2 }) });
    const declineDialog = owner.getByRole("dialog", { name: "Decline version 1", exact: true });
    const password = CUSTOMER.password ?? "";
    expect(password).not.toBe("");

    // The owner opens the agreements from the account overview and reads version 1, its unit and its terms.
    await owner.goto("/account");
    await owner.getByRole("link", { name: "Open your agreements", exact: true }).click({ timeout: 20_000 });
    await expect(owner).toHaveURL(/\/account\/brokerage-agreements$/);
    await expect(owner.getByRole("heading", { level: 1, name: "Brokerage agreements", exact: true })).toBeVisible();
    await expect(ownerCard).toHaveCount(1, { timeout: 20_000 });
    await expect(ownerCard.getByRole("heading", { level: 2 })).toHaveText(/^(Unit .+|A unit with no code)$/);
    await expect(ownerCard.getByText("Long-term rental", { exact: true })).toBeVisible();
    await expect(ownerCard.getByRole("heading", { name: "Version 1", exact: true })).toBeVisible();
    await expect(ownerCard.getByText(/^Waiting for your answer until \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)).toBeVisible();
    await expect(ownerCard.getByText(/^Version 1 of the brokerage agreement for unit /)).toBeVisible();
    for (const text of ["8,000,000 VND per month", "From a lease term of 12 months: 100% of one month's rent"]) {
      await expect(ownerCard.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(owner.getByText("Proposed terms: not confirmed by the owner yet.", { exact: true })).toHaveCount(0);
    await expect(owner.getByText("Proposed fee policy: not confirmed by the owner yet.", { exact: true })).toHaveCount(0);
    await expectNoSidewaysScroll(owner);

    // The owner declines version 1 with a reason; no password is asked.
    await button(ownerCard, "Decline").click();
    await declineDialog.getByLabel(/^Reason/).fill("The rent is too low.");
    await button(declineDialog, "Decline").click();
    await expect(declineDialog).toHaveCount(0, { timeout: 20_000 });
    await expect(ownerCard.getByText(/^You declined it on /)).toBeVisible({ timeout: 20_000 });
    await expect(ownerCard.getByText("Your reason: The rent is too low.", { exact: true })).toBeVisible();
    await expect(ownerCard.getByRole("checkbox")).toHaveCount(0);

    // The Sale reads the rejection, opens a new draft, a copy of version 1, and sends it.
    await sale.goto(agreementPath);
    await expect(agreement.getByText("Rejected by the owner", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByText(/^Rejected by the owner on /)).toBeVisible();
    await expect(agreement.getByText("Reason: The rent is too low.", { exact: true })).toBeVisible();
    await expect(agreement.getByText("Drafting", { exact: true })).toBeVisible();
    const newDrafts = recordApiCalls(sale);
    await button(agreement, "Open a new draft").dblclick();
    await expect(agreement.getByText("Version 2", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByText("Draft", { exact: true })).toBeVisible();
    await expect(button(agreement, "Edit the draft")).toBeVisible();
    expect(newDrafts.filter((call) => call.method === "POST" && call.url.pathname.endsWith("/draft"))).toHaveLength(1);

    const sendDialog = sale.getByRole("dialog", { name: "Send this version to the owner", exact: true });
    await button(agreement, "Send to the owner").click();
    await expect(sendDialog).toContainText("Version 2 goes to the owner of this unit.");
    await button(sendDialog, "Send").click();
    await expect(sendDialog).toHaveCount(0, { timeout: 20_000 });
    await expect(agreement.getByText("Awaiting the owner", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByText(/^The owner may answer until /)).toBeVisible();

    // The owner reads again: only version 2 has a box; a wrong password says so, the right one confirms it.
    await owner.reload();
    const box = ownerCard.getByRole("checkbox", { name: "I have read version 2 and confirm it", exact: true });
    await expect(box).toBeVisible({ timeout: 20_000 });
    await expect(ownerCard.getByRole("checkbox")).toHaveCount(1);
    await expect(ownerCard.getByText(/^Version 2 of the brokerage agreement for unit /)).toBeVisible();
    await box.check();
    await owner.getByLabel("Current password", { exact: true }).fill("not-the-password");
    await button(owner, "Confirm the selected versions (1)").click();
    await expect(owner.getByText("That password isn't right.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByLabel("Current password", { exact: true })).toHaveValue("");

    await owner.getByLabel("Current password", { exact: true }).fill(password);
    await button(owner, "Confirm the selected versions (1)").click();
    await expect(ownerCard.getByText(/^You confirmed it on /)).toBeVisible({ timeout: 20_000 });
    await expect(ownerCard.getByText(/^You declined it on /)).toBeVisible();
    await expect(owner.getByLabel("Current password", { exact: true })).toHaveCount(0);
    expect(await storedText(owner)).not.toContain(password);
    expect(owner.url()).not.toContain(password);

    // The Sale reads the confirmation; the agreement still awaits a manager's activation (the next test, E05-S6).
    await sale.reload();
    await expect(agreement.getByText("Confirmed by the owner", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByText(/^Confirmed by the owner on /)).toBeVisible();
    await expect(agreement.getByText("Awaiting confirmation", { exact: true })).toBeVisible();
    await expect(button(agreement, "Open a new draft")).toHaveCount(0);
  });

  test("agreementActivation_managerActivates_advertisingAnswer (E2E-1, brokerage-agreement US-3 AC-1, AC-2, AC-5, US-4 AC-1)", async () => {
    // The agreement page the previous test leaves open on the Sale's side, version 2 confirmed by the owner. The manager is
    // the chain's admin page (E2E Admin, seed ADMIN): it may see L15 and is neither its assignee (E2E Sale, never
    // reassigned in the chain) nor an author of a version (every draft, edit, new draft and sending above is the Sale's),
    // so it may decide (brokerage-agreement S6-D2, A-4, E05S6-P10). Version 2 is a copy of version 1, whose period is fixed
    // in agreementDraft_fromTheLeadPage_opensItsPage (1 Jan 2027 to 31 Dec 2027): the outcome follows today's date in
    // Vietnam, and once that period has passed the test fails before it activates, never skips. No login, no owner POST.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    if (today > "2027-12-31") {
      throw new Error(
        "The chain's fixed agreement period (1 Jan 2027 to 31 Dec 2027, set in agreementDraft_fromTheLeadPage_opensItsPage) has passed: move those dates forward before this test can activate the agreement.",
      );
    }
    const beforeStart = today < "2027-01-01";
    const agreementPath = new URL(sale.url()).pathname;
    const agreement = mainArea(sale);
    const DOCUMENT = /^Document HDMG-E2E\/001, signed on .+; signed for Sunvibe by E2E Signatory, Director\.$/;

    // The Sale, the lead's assignee, sees until when the version waits and no activation section.
    await expect(agreement.getByText(/^Waiting for a manager's activation until /)).toBeVisible({ timeout: 20_000 });
    await expect(agreement.getByRole("region", { name: "Activation", exact: true })).toHaveCount(0);
    await expect(
      agreement.getByRole("region", { name: "Advertising", exact: true }).getByText("The agreement is not in effect yet.", { exact: true }),
    ).toBeVisible();

    // The manager opens the agreement, enters the signed document, makes the statement and activates once.
    await admin.goto(agreementPath);
    const page = mainArea(admin);
    const section = page.getByRole("region", { name: "Activation", exact: true });
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect(section.getByText(/^The owner confirmed version 2 on .+\. Activate it by .+\.$/)).toBeVisible();
    await section.getByLabel("Document number", { exact: true }).fill("HDMG-E2E/001");
    await section.getByLabel("Signed on", { exact: true }).fill(today);
    await section.getByLabel("Sunvibe's signatory: name", { exact: true }).fill("E2E Signatory");
    await section.getByLabel("Sunvibe's signatory: title", { exact: true }).fill("Director");
    await expect(button(section, "Activate")).toBeDisabled();
    await section.getByRole("checkbox", { name: "I make the statement above.", exact: true }).check();
    const activations = recordApiCalls(admin);
    await button(section, "Activate").dblclick();
    await expect(section).toHaveCount(0, { timeout: 20_000 });
    expect(activations.filter((call) => call.method === "POST" && call.url.pathname.endsWith("/activation"))).toHaveLength(1);

    await expect(page.getByText("Active", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(DOCUMENT)).toBeVisible();
    const panel = page.getByRole("region", { name: "Advertising", exact: true });
    const ownerCard = owner.getByRole("listitem").filter({ has: owner.getByRole("heading", { level: 2 }) });
    await owner.reload();
    if (beforeStart) {
      await expect(page.getByText("Activated", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Activated on .+; takes effect on 1 Jan 2027\.$/)).toBeVisible();
      // Not started yet is the only group: the panel holds its heading, the refusal line and that one line.
      await expect(panel).toHaveText(
        ["Advertising", "Sunvibe may not advertise this unit now:", "Advertising starts on 1 Jan 2027."].join(""),
      );
      await expect(ownerCard.getByText("Signed and activated. It takes effect on 1 Jan 2027.", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    } else {
      await expect(page.getByText("In effect", { exact: true })).toBeVisible();
      await expect(page.getByText("In effect.", { exact: true })).toBeVisible();
      await expect(panel.getByText("Sunvibe may advertise this unit until the end of 31 Dec 2027.", { exact: true })).toBeVisible();
      await expect(ownerCard.getByText("In effect until 31 Dec 2027.", { exact: true })).toBeVisible({ timeout: 20_000 });
    }
    // The owner page shows no activation record (brokerage-agreement S6-D21, BR-17).
    await expect(owner.getByText(/HDMG-E2E\/001|E2E Signatory/)).toHaveCount(0);
  });

  test("agreementList_activeRowAndHistory_saleAndLeader (E2E-1, brokerage-agreement US-4 AC-3, AC-4)", async ({ browser }) => {
    // The agreement the chain activated above (version 2, 1 Jan 2027 to 31 Dec 2027, set in
    // agreementDraft_fromTheLeadPage_opensItsPage), still open on the Sale's side. Its unit code comes from the chain's
    // intake, so its row is found by the link to its page. The lines follow today's date in Vietnam, as the activation
    // test reads it; once that period has passed the test fails with the same message, never skips. One login: the
    // leader, in a context of this test (E05S7-P9).
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    if (today > "2027-12-31") {
      throw new Error(
        "The chain's fixed agreement period (1 Jan 2027 to 31 Dec 2027, set in agreementDraft_fromTheLeadPage_opensItsPage) has passed: move those dates forward before this test can activate the agreement.",
      );
    }
    const beforeStart = today < "2027-01-01";
    // "Ends within the next 30 days": an end date from today to today + 29 days, Vietnam calendar (S7-D4).
    const endsSoon = today >= "2027-12-02";
    const agreementPath = new URL(sale.url()).pathname;
    const LIST = /\/workspace\/brokerage-agreements(\?.*)?$/;
    /** The answer of the list read of "Active", with or without the ending filter. */
    const listRead = (page: Page, endingFilter: boolean) =>
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname.endsWith("/api/v1/staff/brokerage-agreements") &&
          url.searchParams.getAll("status").join() === "ACTIVE" &&
          url.searchParams.has("endsWithin30Days") === endingFilter
        );
      });
    const rowOf = (page: Page): Locator =>
      mainArea(page).getByRole("listitem").filter({ has: page.locator(`a[href="${agreementPath}"]`) });

    /** Opens AGREEMENTS from the menu, chooses "Active" and waits for that list. */
    async function activeAgreements(page: Page): Promise<Locator> {
      await page.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuAgreements, exact: true }).click();
      await expect(page).toHaveURL(LIST);
      await expect(mainArea(page).getByRole("heading", { level: 1, name: "Brokerage agreements", exact: true })).toBeVisible({
        timeout: 20_000,
      });
      const read = listRead(page, false);
      await mainArea(page).getByLabel("State", { exact: true }).selectOption({ label: "Active" });
      await read;
      await expect(page).toHaveURL(/\/workspace\/brokerage-agreements\?status=ACTIVE$/);
      const row = rowOf(page);
      await expect(row).toHaveCount(1, { timeout: 20_000 });
      return row;
    }

    // The assigned Sale lists the active agreements and reads the chain's row with its answer at the read.
    const row = await activeAgreements(sale);
    await expect(row.getByRole("link")).toHaveText(/^.+$/);
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
    if (beforeStart) {
      await expect(row.getByText("Version 2: Activated", { exact: true })).toBeVisible();
      await expect(row.getByText("Sunvibe may not advertise this unit now:", { exact: true })).toBeVisible();
      await expect(row.getByText("Advertising starts on 1 Jan 2027.", { exact: true })).toBeVisible();
    } else {
      await expect(row.getByText("Version 2: In effect", { exact: true })).toBeVisible();
      await expect(row.getByText("Sunvibe may advertise this unit until the end of 31 Dec 2027.", { exact: true })).toBeVisible();
    }

    // "Ends within the next 30 days" keeps the row only in the last 30 days of its period.
    const ending = mainArea(sale).getByRole("checkbox", { name: "Ends within the next 30 days", exact: true });
    const endingRead = listRead(sale, true);
    await ending.check();
    await endingRead;
    await expect(sale).toHaveURL(/\?status=ACTIVE&ending=1$/);
    await expect(mainArea(sale).getByText("Loading agreements…", { exact: true })).toHaveCount(0, { timeout: 20_000 });
    await expect(rowOf(sale)).toHaveCount(endsSoon ? 1 : 0);

    // Unticked again, the row opens the agreement page; its history names who acted, the owner never by name.
    const allRead = listRead(sale, false);
    await ending.uncheck();
    await allRead;
    await expect(rowOf(sale)).toHaveCount(1, { timeout: 20_000 });
    await rowOf(sale).getByRole("link").click();
    await expect(sale).toHaveURL(new RegExp(`${agreementPath}$`), { timeout: 20_000 });
    const history = mainArea(sale).getByRole("region", { name: "History", exact: true });
    await button(history, "Show history").click({ timeout: 20_000 });
    const event = (text: string): Locator => history.getByRole("listitem").filter({ has: sale.getByText(text, { exact: true }) });
    await expect(event("Activated")).toHaveCount(1, { timeout: 20_000 });
    await expect(event("Activated").getByText(fixture.admin.name, { exact: true })).toBeVisible();
    await expect(event("Confirmed by the owner")).toHaveCount(1);
    await expect(event("Confirmed by the owner").getByText("The owner", { exact: true })).toBeVisible();
    await expect(event("Agreement drafted")).toHaveCount(1);
    await expect(history.getByText("The rent is too low.")).toHaveCount(0);
    await expect(button(history, "Hide history")).toBeVisible();

    // A manager (the leader account) sees the same row.
    const leaderContext = await newStaffContext(browser);
    try {
      const leader = await leaderContext.newPage();
      await signInAs(leader, "SALE_LEADER");
      await expectSignedInAccount(leader);
      await leader.getByRole("link", { name: T.openWorkspace }).click();
      await expectListPage(leader);
      const leaderRow = await activeAgreements(leader);
      await expect(leaderRow.getByText("Active", { exact: true })).toBeVisible();
      await expect(leaderRow.getByText(beforeStart ? "Version 2: Activated" : "Version 2: In effect", { exact: true })).toBeVisible();
    } finally {
      await leaderContext.close();
    }
  });

  test("eligibility_leadWithoutIntake_noneAndE1Lines (UD-8, UD-1, brokerage-agreement US-1 AC-1, E-1)", async () => {
    // L1: the seed completes no intake, and no spec of the chain completes one on it.
    await admin.goto(fixture.lead(1).path);
    const eligibility = mainArea(admin).getByRole("region", { name: "Agreement eligibility", exact: true });
    await expect(eligibility.getByText("This lead has no completed intake yet.", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(eligibility.getByText(E1, { exact: true })).toBeVisible();
    await expect(eligibility.getByRole("listitem")).toHaveCount(0);
  });
});

// No fixture reaches a case, so the answers are stubbed: this is about what the pages do with them. Budget: 1 login.
test.describe("Inventory cases (property-create intake 7.2)", () => {
  const CASE_ID = "01JE2ECASE0000000000000001";
  const CASES = /\/api\/v1\/staff\/inventory-cases(\?.*)?$/;
  const ONE_CASE = new RegExp(`/api/v1/staff/inventory-cases/${CASE_ID}$`);
  const DECISION = new RegExp(`/api/v1/staff/inventory-cases/${CASE_ID}/decision$`);
  const openCase = (version: number) => ({
    caseId: CASE_ID,
    status: "OPEN",
    signal: "ADDRESS",
    version,
    intake: { intakeId: "I1", leadCode: "R-0001", wardName: "Hải Châu", parts: [{ code: "P1", location: "Floor 1" }] },
    candidate: {
      kind: "INTAKE",
      intakeId: "I2",
      code: "R-0002",
      boundary: { assetType: "HOUSE", layout: "WHOLE", wardName: "Hải Châu", addressText: "12 Lê Lợi" },
      units: [{ code: "P1", location: null }],
      ownerMatches: null,
    },
  });

  test("a manager opens a case from the menu, and a refused decision keeps what was chosen for the next Save", async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const context = await newStaffContext(browser);
    const page = await context.newPage();
    let version = 3;
    const sent: { expectedVersion?: number; outcome?: string; proceedingIntakeId?: string }[] = [];

    await page.route(CASES, (route) =>
      route.fulfill({
        json: { items: [{ caseId: CASE_ID, leadCode: "R-0001", wardName: "Hải Châu", createdAt: "2026-11-06T02:00:00Z" }], page: 0, size: 20, totalElements: 1 },
      }),
    );
    await page.route(ONE_CASE, (route) => route.fulfill({ json: openCase(version) }));
    await page.route(DECISION, async (route) => {
      sent.push(route.request().postDataJSON() as (typeof sent)[number]);
      if (sent.length === 1) {
        version = 4;
        await route.fulfill({ status: 409, json: { code: "CONCURRENT_MODIFICATION", message: "x", errors: [] } });
        return;
      }
      await route.fulfill({
        json: { ...openCase(5), status: "DECIDED", outcome: "SAME_ASSET", basis: "The same house", decidedAt: "2026-11-06T02:10:00Z" },
      });
    });

    await signInAs(page, "ADMIN");
    await expectSignedInAccount(page);
    await page.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(page);
    await page.getByRole("navigation", { name: T.menuLabel }).getByRole("link", { name: T.menuInventoryCases }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Inventory cases" })).toBeVisible();
    await mainArea(page).getByRole("link", { name: /R-0001/ }).click();
    await expect(step(page, "Candidate")).toContainText("Intake of lead R-0002", { timeout: 20_000 });

    const decision = step(page, "Decision");
    await decision.getByLabel("Outcome").selectOption("SAME_ASSET");
    await decision.getByLabel("The intake that goes on").selectOption("I2");
    await decision.getByLabel("Basis").fill("The same house");
    await button(decision, "Save the decision").click();

    await expect(mainArea(page).getByText(I.moved, { exact: true })).toBeVisible();
    await expect(decision.getByLabel("Outcome")).toHaveValue("SAME_ASSET");
    await expect(decision.getByLabel("The intake that goes on")).toHaveValue("I2");
    await expect(decision.getByLabel("Basis")).toHaveValue("The same house");

    await button(decision, "Save the decision").click();
    await expect(mainArea(page).getByText("Same asset", { exact: true })).toBeVisible();
    await expect(button(page, "Save the decision")).toHaveCount(0);
    expect(sent.map((body) => body.expectedVersion)).toEqual([3, 4]);
    expect(sent[1]).toMatchObject({ outcome: "SAME_ASSET", proceedingIntakeId: "I2" });
    await context.close();
  });
});

// A read that fails is hard to reach on a real server: the owner's calls are stubbed. Budget: 1 login, no owner POST.
test.describe("Property confirmations when a read fails (property-create intake 6.2)", () => {
  const LIST = /\/api\/v1\/me\/property-confirmations$/;
  const DETAILS = /\/property-confirmations\/Q1\/details$/;
  const DECLINE = /\/property-confirmations\/Q1\/decline$/;
  const ADDRESS = "12 Lê Lợi";
  const snapshot = { leadCode: "R-0001", wardName: "Hải Châu", assetType: "HOUSE", address: ADDRESS, parts: [{ code: "P1", location: null }] };

  test("after a decline no address stays, and a failed Check again says so", async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    const context = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP });
    const page = await context.newPage();
    let list: "pending" | "confirmed" | "failing" = "pending";

    await page.route(LIST, (route) => {
      if (list === "failing") return route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR", message: "x", errors: [] } });
      const item =
        list === "pending"
          ? { requestId: "Q1", status: "PENDING", expiresAt: "2026-11-13T00:00:00Z" }
          : { requestId: "Q1", status: "CONFIRMED", expiresAt: "2026-11-13T00:00:00Z", details: snapshot, checkOpen: false };
      return route.fulfill({ json: { items: [item] } });
    });
    await page.route(DETAILS, (route) => route.fulfill({ json: { ...snapshot, statement: { version: "v1", text: "I confirm." } } }));
    await page.route(DECLINE, (route) => route.fulfill({ status: 204 }));

    await signInAs(page, "CUSTOMER");
    await expectSignedInAccount(page);
    await page.getByRole("link", { name: "Open your requests", exact: true }).click();

    const request = page.getByRole("listitem").filter({ hasText: "A request to confirm a property" });
    await request.getByLabel("Confirmation code").fill("ABCD2345");
    await button(request, "See the details").click();
    await expect(page.getByText(ADDRESS)).toBeVisible();

    list = "failing";
    await button(page, "This is not mine").click();
    await expect(page.getByText("Saved. This request has ended.", { exact: true })).toBeVisible();
    await expect(page.getByText("Your requests could not be read.", { exact: true })).toBeVisible();
    await expect(page.getByText(ADDRESS)).toHaveCount(0);

    list = "confirmed";
    await button(page, "Try again").click();
    await expect(button(page, "Check again")).toBeVisible();

    list = "failing";
    await button(page, "Check again").click();
    await expect(page.getByText("Something went wrong. Please try again.", { exact: true })).toBeVisible();
    await context.close();
  });
});
