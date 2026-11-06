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
// changed in the browser: a stale previewHash. Budget: 3 logins (SALE, CUSTOMER, ADMIN), and 5 of the 10 owner POSTs an IP may
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
