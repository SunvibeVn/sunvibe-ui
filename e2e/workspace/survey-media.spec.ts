import { readFile } from "node:fs/promises";
import path from "node:path";

import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";

import { API_URL } from "../support/api";
import { expectSignedInAccount } from "../support/auth";
import {
  assigneeOption,
  byText,
  DESKTOP,
  dialog,
  expectLeadDetail,
  expectListPage,
  fixture,
  mainArea,
  newStaffContext,
  openLead,
  signInAs,
  T,
  workspaceE2eReady,
  WORKSPACE_E2E_SKIP_REASON,
} from "./support/staff";

// Survey photos on a checklist draft (survey-media spec 6.4; SM-27, SM-28, SM-29), the scenarios in the spec's order.
// Budget: 3 sign-ins (SALE, SALE_LEADER, ADMIN); full loads: the checklist URL twice for the leader and once for the
// admin, one reload of the SALE's page. SM-FE-09 answers one G1 save with a 403 inside the test; the last test checks
// that no photo request of the run sent a cookie (SM-FE-10). No trace, video or screenshot in this project
// (playwright.workspace.config.ts): no photo may land in a file of the run.
//
// Needs the API of sunvibe-server scripts/dev/run-e2e-media-api.sh (uploads and processing on, the local store, the
// stub scanner, the dev processing container) and both seeds run again just before. Fixture L14 (SURVEY_SCHEDULED,
// long-term rent of rooms, E2E Sale, visited yesterday by E2E Sale) changes, in this order: the SALE starts checklist
// #1, saves G1 (two spaces in PARTS) and uploads every required pair, some files that are not accepted and a duplicate;
// the leader views and downloads; the admin holds and releases photo #1; the leader takes L14 over (the SALE loses the
// images), takes the draft over, removes photo #1 with a correction, removes space P2 with its photos and records a
// newer visit, which makes the checklist read-only. A re-run of the lead seed clears L14's photos.

test.describe.configure({ mode: "serial", timeout: 300_000 });

const L14 = fixture.lead(14);
const LEADER_OPTION = assigneeOption(fixture.leader.name, "Sale leader");
const MEDIA = path.join(__dirname, "..", "fixtures", "media");

const M = {
  start: "Start checklist (survey #1)",
  open: "Open checklist #1",
  internalOnly: "Internal survey evidence. Not approved for listings.",
  firstGate: "Some required items are missing. See the list above.",
  asset: "Asset (whole property)",
  motion: "Turn off Motion or Live Photo, or export a still image, then upload it again.",
  duplicate: "This photo is already in the checklist.",
  heldForOthers: "Held by an administrator since",
  newerVisit: "A newer site visit exists.",
  g1Hint: "Saving removes 3 photos on the spaces or shared rooms this change ends.",
} as const;

/** Every reason of spec 6.3 in words: a file that is not accepted shows one of them. */
const REASONS = [
  M.motion,
  "This file contains more than a photo.",
  "This file type is not supported. Use JPEG, PNG, WebP or HEIC.",
  "The file could not be read as a photo.",
  "Use the camera's normal resolution, not a 200 MP mode.",
  "The photo could not be processed. Upload it again.",
];

const VIETNAM_MS = 7 * 60 * 60 * 1000;
const vietnamInput = (ms: number): string => new Date(ms + VIETNAM_MS).toISOString().slice(0, 16);
const vietnamToday = (): string => vietnamInput(Date.now()).slice(0, 10);
const minutesAhead = (minutes: number): number => Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000;

const checklistPath = (checklistId: string) => `${L14.path}/survey-checklists/${checklistId}`;
const surveySection = (page: Page): Locator => mainArea(page).getByRole("region", { name: "Survey", exact: true });
const panel = (page: Page, title: string): Locator => mainArea(page).getByRole("region", { name: title, exact: true });
/** G7 of the Edit tab for the holder; the read-only Edit names it "Photos". */
const photos = (page: Page, editable: boolean): Locator => panel(page, editable ? "G7 Photos" : "Photos");
const uploadForm = (scope: Locator): Locator => scope.getByRole("region", { name: "Add photos", exact: true });
const uploadRows = (scope: Locator): Locator => scope.getByRole("region", { name: "Uploads", exact: true }).getByRole("listitem");
/** A grid card by its photo number ("Photo #1" but not "Photo #10"). */
const card = (scope: Locator, no: number): Locator => scope.getByRole("listitem").filter({ hasText: new RegExp(`Photo #${no}(?!\\d)`) });
const field = (scope: Locator, label: string): Locator => scope.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

type Payload = { name: string; mimeType: string; buffer: Buffer };

async function fixtureFile(name: string, mimeType: string): Promise<Payload> {
  return { name, mimeType, buffer: await readFile(path.join(MEDIA, name)) };
}

/** A distinct synthetic JPEG drawn in the page (different bytes for every pair, survey-media A-16). */
async function drawnJpeg(page: Page, label: string, hue: number): Promise<Payload> {
  const dataUrl = await page.evaluate(
    ([text, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (context === null) return "";
      context.fillStyle = `hsl(${h} 55% 50%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "64px sans-serif";
      context.fillText(String(text), 60, 380);
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    [label, hue] as const,
  );
  return { name: `${label.replace(/\W+/g, "-")}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1] ?? "", "base64") };
}

async function upload(scope: Locator, placement: string, category: string, file: Payload, caption = ""): Promise<void> {
  const form = uploadForm(scope);
  await form.getByRole("combobox", { name: "Placement" }).selectOption({ label: placement });
  await form.getByRole("combobox", { name: "Evidence category" }).selectOption({ label: category });
  await field(form, "Caption").fill(caption);
  await form.getByLabel("Choose photos", { exact: true }).setInputFiles(file);
}

/** True when a JPEG still carries EXIF or XMP (APP1) before its scan data. */
function jpegHasMetadata(bytes: Buffer): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("not a JPEG");
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xe1) {
      const head = bytes.subarray(offset + 4, offset + 4 + 32).toString("latin1");
      if (head.startsWith("Exif") || head.startsWith("http://ns.adobe.com/xap/")) return true;
    }
    offset += 2 + length;
  }
  return false;
}

/** `cookie` is null when the headers of the request never came (see watchMediaRequests). */
type MediaRequest = { method: string; path: string; cookie: boolean | null };

/**
 * Records every request of a page to the photo endpoints of the API (list, create, content PUT by XMLHttpRequest,
 * images, removal, hold): its method, path and whether the browser sent a Cookie header (SM-FE-10). A list poll in
 * flight when its page reloads can end with no response and no failure, so its headers never come: after 10 s it
 * counts with cookie null instead of holding the test for its whole timeout.
 */
function watchMediaRequests(page: Page): () => Promise<MediaRequest[]> {
  const seen: Array<{ method: string; path: string; cookie: Promise<boolean> }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(API_URL).origin) return;
    if (!/^\/api\/v1\/staff\/(survey-media\/|survey-checklists\/[^/]+\/media)/.test(url.pathname)) return;
    seen.push({ method: request.method(), path: url.pathname, cookie: request.allHeaders().then((headers) => "cookie" in headers) });
  });
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(resolve, 10_000, null);
    });
    const requests = await Promise.all(
      seen.map(async ({ cookie, ...request }) => ({ ...request, cookie: await Promise.race([cookie, late]) })),
    );
    clearTimeout(timer);
    return requests;
  };
}

async function correct(scope: Locator, reason: string): Promise<void> {
  const box = scope.getByRole("group", { name: "Correction", exact: true });
  await expect(box).toBeVisible({ timeout: 20_000 });
  await box.getByRole("textbox", { name: "Reason for the correction" }).fill(reason);
  await box.getByLabel(/^Date of the basis/).fill(vietnamToday());
  await box.getByRole("textbox", { name: "Basis", exact: true }).fill("Handover call with the sale");
  await box.getByRole("button", { name: "Save with the correction" }).click();
}

test.describe("Survey photos (survey-media media-b)", () => {
  let saleContext: BrowserContext;
  let sale: Page;
  let leaderContext: BrowserContext;
  let leader: Page;
  let adminContext: BrowserContext;
  let admin: Page;
  let checklistId = "";
  const mediaRequests: Array<() => Promise<MediaRequest[]>> = [];

  test.beforeAll(async ({ browser }) => {
    test.skip(!(await workspaceE2eReady()), WORKSPACE_E2E_SKIP_REASON);
    const { baseURL } = test.info().project.use;
    saleContext = await browser.newContext({ baseURL, locale: "vi-VN", viewport: DESKTOP, acceptDownloads: true });
    sale = await saleContext.newPage();
    leaderContext = await newStaffContext(browser);
    leader = await leaderContext.newPage();
    adminContext = await newStaffContext(browser);
    admin = await adminContext.newPage();
    mediaRequests.push(watchMediaRequests(sale), watchMediaRequests(leader), watchMediaRequests(admin));
  });

  test.afterAll(async () => {
    await saleContext?.close();
    await leaderContext?.close();
    await adminContext?.close();
  });

  test("SM-27, SM-29: the SALE uploads every required pair; coverage is complete, submission still unavailable", async () => {
    await signInAs(sale, "SALE");
    await expectSignedInAccount(sale);
    await sale.getByRole("link", { name: T.openWorkspace }).click();
    await expectListPage(sale);
    await openLead(sale, L14);
    await surveySection(sale).getByRole("button", { name: M.start, exact: true }).click();
    await expect(sale).toHaveURL(/\/survey-checklists\/[0-9A-Z]{26}$/, { timeout: 20_000 });
    checklistId = new URL(sale.url()).pathname.split("/").at(-1) ?? "";
    await expect(byText(sale, M.firstGate)).toBeVisible({ timeout: 20_000 });

    const g7 = photos(sale, true);
    await expect(g7.getByText(M.internalOnly, { exact: true })).toBeVisible();
    // The start-up sweep opens intake: the upload form shows only once `intakePaused` is false (spec 6.4).
    await expect(uploadForm(g7)).toBeVisible({ timeout: 90_000 });

    // G1: PARTS with two spaces, so every required pair exists (spec 4.6).
    const g1 = panel(sale, "G1 Identification");
    await g1.getByRole("group", { name: "Rental scope", exact: true }).getByRole("radio", { name: "Separate parts" }).check();
    const spaces = g1.getByRole("group", { name: "Spaces viewed", exact: true });
    await spaces.getByRole("button", { name: "Add a space" }).click();
    await spaces.getByRole("button", { name: "Add a space" }).click();
    await spaces.getByRole("textbox", { name: "Code" }).nth(0).fill("P1");
    await spaces.getByRole("textbox", { name: "Where it is" }).nth(0).fill("Ground floor, front");
    await spaces.getByRole("textbox", { name: "Code" }).nth(1).fill("P2");
    await spaces.getByRole("textbox", { name: "Where it is" }).nth(1).fill("First floor, back");
    await g1.getByRole("button", { name: "Save", exact: true }).click();
    await expect(g1.getByRole("status")).toContainText(`by ${fixture.sale.name}`, { timeout: 20_000 });
    await expect(g7.getByText("Space P2 · Bathroom", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // Photo #1 first (its number is fixed for the later steps), with a caption and GPS EXIF.
    await upload(g7, M.asset, "Exterior and access", await fixtureFile("gps-exif.jpg", "image/jpeg"), "Front gate");
    await expect(uploadRows(g7).first()).toContainText(/Processing|Ready/, { timeout: 60_000 });
    await upload(g7, M.asset, "Shared kitchen", await fixtureFile("small.png", "image/png"));
    await upload(g7, M.asset, "Shared bathroom", await fixtureFile("still.webp", "image/webp"));
    await upload(g7, "Space P1", "Main space", await fixtureFile("still.heic", "image/heic"));
    let hue = 10;
    for (const [code, category] of [
      ["P1", "Kitchen"],
      ["P1", "Bathroom"],
      ["P2", "Main space"],
      ["P2", "Kitchen"],
      ["P2", "Bathroom"],
    ] as const) {
      await upload(g7, `Space ${code}`, category, await drawnJpeg(sale, `${code} ${category}`, (hue += 40)));
    }

    // SM-27: each file its own row; nothing shows ready before the server says READY.
    await expect(uploadRows(g7)).toHaveCount(9);
    await expect(uploadRows(g7).filter({ hasText: "Ready" })).toHaveCount(9, { timeout: 180_000 });
    await expect(g7.getByText("Ready (1)", { exact: true })).toHaveCount(9);
    await expect(g7.getByText("Missing", { exact: true })).toHaveCount(0);
    await expect(card(g7, 1).getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 30_000 });

    // Coverage complete is a readiness fact only: the submit panel still names its first failing gate, no photo gap is left.
    await mainArea(sale).getByRole("navigation", { name: "Checklist views" }).getByRole("link", { name: "Preview" }).click();
    await expect(mainArea(sale).getByRole("link", { name: /^Photo missing/ })).toHaveCount(0);
    await expect(mainArea(sale).getByRole("button", { name: /submit|listing/i })).toHaveCount(0);
    await mainArea(sale).getByRole("navigation", { name: "Checklist views" }).getByRole("link", { name: "Edit" }).click();
    await expect(byText(sale, M.firstGate)).toBeVisible();
    await expect(mainArea(sale).getByRole("button", { name: /submit|listing/i })).toHaveCount(0);
  });

  test("SM-27: files that are not accepted fail alone, each with its reason (motion photo guidance)", async () => {
    const g7 = photos(sale, true);
    for (const [name, type] of [
      ["motion.jpg", "image/jpeg"],
      ["animated.webp", "image/webp"],
      ["corrupt.jpg", "image/jpeg"],
      ["image.svg", "image/svg+xml"],
    ] as const) {
      await upload(g7, M.asset, "Detail", await fixtureFile(name, type));
    }
    const rejected = uploadRows(g7).filter({ hasText: "Not accepted" });
    await expect(rejected).toHaveCount(4, { timeout: 180_000 });
    for (const row of await rejected.all()) {
      await expect(row).toContainText(new RegExp(REASONS.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")));
    }
    await expect(g7.getByText(M.motion).first()).toBeVisible();
    // The accepted photos are untouched.
    await expect(g7.getByText("Ready (1)", { exact: true })).toHaveCount(9);
  });

  test("a downloaded file has no EXIF; the same file twice is refused as a duplicate", async () => {
    const g7 = photos(sale, true);
    await card(g7, 1).getByRole("button", { name: "Open photo #1" }).click();
    const viewer = dialog(sale, `Photo #1 · ${M.asset} · Exterior and access`);
    await expect(viewer.getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 30_000 });
    const pending = sale.waitForEvent("download");
    await viewer.getByRole("button", { name: "Download", exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("sunvibe-checklist-1-photo-1.jpg");
    const bytes = await readFile((await download.path()) ?? "");
    expect(jpegHasMetadata(bytes)).toBe(false);
    expect(bytes.includes(Buffer.from("GPS", "latin1"))).toBe(false);
    await viewer.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(viewer).toHaveCount(0);

    await upload(g7, M.asset, "Exterior and access", await fixtureFile("gps-exif.jpg", "image/jpeg"));
    const duplicate = uploadRows(g7).filter({ hasText: M.duplicate });
    await expect(duplicate).toHaveCount(1, { timeout: 30_000 });
    await expect(duplicate.getByRole("link", { name: "Show the matching photo" })).toBeVisible();
    await duplicate.getByRole("button", { name: "Dismiss" }).click();
    await expect(duplicate).toHaveCount(0);
  });

  test("SM-29: the leader views and downloads without upload or Remove controls", async () => {
    await signInAs(leader, "SALE_LEADER");
    await expectSignedInAccount(leader);
    await leader.goto(checklistPath(checklistId));
    const g7 = photos(leader, false);
    await expect(card(g7, 1).getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(g7.getByText(M.internalOnly, { exact: true })).toBeVisible();
    await expect(uploadForm(g7)).toHaveCount(0);
    await expect(g7.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await expect(g7.getByRole("button", { name: "Hold", exact: true })).toHaveCount(0);
    await card(g7, 2).getByRole("button", { name: "Open photo #2" }).click();
    const viewer = leader.getByRole("dialog");
    await expect(viewer.getByAltText("Photo #2", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(viewer.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    const pending = leader.waitForEvent("download");
    await viewer.getByRole("button", { name: "Download", exact: true }).click();
    expect((await pending).suggestedFilename()).toBe("sunvibe-checklist-1-photo-2.jpg");
    await viewer.getByRole("button", { name: "Close", exact: true }).first().click();
  });

  test("SM-29: the admin holds photo #1; the holder sees it held without image or caption, still with Remove; released", async () => {
    await signInAs(admin, "ADMIN");
    await expectSignedInAccount(admin);
    await admin.goto(checklistPath(checklistId));
    const adminPhotos = photos(admin, false);
    const adminCard = card(adminPhotos, 1);
    await expect(adminCard.getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 30_000 });
    await adminCard.getByRole("button", { name: "Hold", exact: true }).click();
    await adminCard.getByRole("combobox", { name: "Reason for the hold" }).selectOption({ label: "Security incident" });
    await adminCard.getByRole("button", { name: "Hold the photo", exact: true }).click();
    await expect(adminCard).toContainText(`Held by ${fixture.admin.name} since`, { timeout: 20_000 });
    await expect(adminCard).toContainText("Security incident");
    await expect(adminCard).toContainText("Front gate");

    await sale.reload();
    const g7 = photos(sale, true);
    const saleCard = card(g7, 1);
    await expect(saleCard).toContainText(M.heldForOthers, { timeout: 30_000 });
    await expect(saleCard).not.toContainText("Front gate");
    await expect(saleCard).not.toContainText("Security incident");
    await expect(saleCard).not.toContainText(fixture.admin.name);
    await expect(saleCard.getByAltText(/^Photo #/)).toHaveCount(0);
    await expect(saleCard.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await expect(g7.getByRole("button", { name: "Hold", exact: true })).toHaveCount(0);

    await adminCard.getByRole("button", { name: "Release the hold", exact: true }).click();
    await expect(adminCard).not.toContainText("Held by", { timeout: 20_000 });
    await expect(adminCard.getByText("Ready", { exact: true })).toBeVisible();

  });

  test("SM-28: after the reassignment the old Sale's page drops every image on its next answer (404)", async () => {
    const g7 = photos(sale, true);
    // The page reads the list again when it becomes visible (spec 6.2): the released photo shows again.
    await sale.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(card(g7, 1).getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 90_000 });

    // SM-FE-09: a 403 of a W16 command (a G1 save, answered 403 here by the test) drops every image at once, with no
    // list poll in between (the idle poll is 60 s away); the next list read brings them back.
    const g1Save = `**/api/v1/staff/survey-checklists/${checklistId}/identification`;
    await sale.route(g1Save, (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ code: "FORBIDDEN", message: "Forbidden", errors: [], correlationId: "e2e-sm-fe-09" }),
          })
        : route.continue(),
    );
    const shownUrl = (await card(g7, 1).getByAltText("Photo #1", { exact: true }).getAttribute("src")) ?? "";
    expect(shownUrl.startsWith("blob:")).toBe(true);
    const g1 = panel(sale, "G1 Identification");
    const note = g1.getByRole("textbox", { name: /^General note/ });
    await note.fill("Side door");
    await g1.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sale.locator('img[src^="blob:"]')).toHaveCount(0, { timeout: 3_000 });
    // The object URL itself is revoked, not only taken off the page.
    expect(await sale.evaluate((url) => fetch(url).then(() => true, () => false), shownUrl)).toBe(false);
    await sale.unroute(g1Save);
    await note.fill("");
    await expect(g1.getByRole("status")).not.toContainText("Unsaved changes");
    await sale.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(card(g7, 1).getByAltText("Photo #1", { exact: true })).toBeVisible({ timeout: 90_000 });

    await mainArea(leader).getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L14);
    await leader.getByRole("button", { name: T.reassign }).click();
    const assign = dialog(leader, "Reassign lead");
    await assign.getByRole("combobox").selectOption({ label: LEADER_OPTION });
    await assign.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(byText(leader, T.assignSaved)).toBeVisible();

    // The SALE's page asks again when it becomes visible (spec 6.2); the 404 drops the images and leaves (W16).
    await sale.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(byText(sale, T.leadNotFoundNotice)).toBeVisible({ timeout: 30_000 });
    await expect(sale.locator('img[src^="blob:"]')).toHaveCount(0);
    // No image in browser storage (SM-28): no Web Storage value holds an image, no Cache API entry, no IndexedDB.
    const stored = await sale.evaluate(async () => {
      const image = (value: string) => value.includes("blob:") || value.startsWith("data:image") || value.includes("/content/");
      return {
        storage: [...Object.values(localStorage), ...Object.values(sessionStorage)].filter(image).length,
        caches: "caches" in window ? (await caches.keys()).length : 0,
        databases: "databases" in indexedDB ? (await indexedDB.databases()).length : 0,
      };
    });
    expect(stored).toEqual({ storage: 0, caches: 0, databases: 0 });
  });

  test("takeover by the new assignee, then the removal of the previous holder's photo with a correction", async () => {
    await surveySection(leader).getByRole("link", { name: M.open }).click();
    await mainArea(leader).getByRole("button", { name: "Take over", exact: true }).click({ timeout: 20_000 });
    const takeover = dialog(leader, "Take over this draft");
    await takeover.getByRole("textbox", { name: "Reason", exact: true }).fill("Lead reassigned to me");
    await takeover.getByLabel(/^Date of the basis/).fill(vietnamToday());
    await takeover.getByRole("textbox", { name: "Basis", exact: true }).fill("Handover call with the sale");
    await takeover.getByRole("button", { name: "Take over", exact: true }).click();
    await expect(takeover).toHaveCount(0, { timeout: 20_000 });

    const g7 = photos(leader, true);
    await expect(uploadForm(g7)).toBeVisible({ timeout: 30_000 });
    await card(g7, 1).getByRole("button", { name: "Remove", exact: true }).click();
    const remove = dialog(leader, "Remove photo #1?");
    await expect(remove).toContainText("Someone else uploaded this photo. Removing it needs a correction.");
    await correct(remove, "Wrong angle, retake planned");
    await expect(remove).toHaveCount(0, { timeout: 20_000 });
    const removed = g7.getByRole("region", { name: "Removed photos", exact: true });
    await expect(removed).toContainText(`Photo #1 · ${M.asset} · Exterior and access: removed by ${fixture.leader.name}`, { timeout: 30_000 });
    await expect(g7.getByText("Missing", { exact: true })).toHaveCount(1);
  });

  test("SM-29: a G1 change removing a space with photos says how many before Save and removes them", async () => {
    const g1 = panel(leader, "G1 Identification");
    await g1.getByRole("button", { name: "Remove P2", exact: true }).click();
    await expect(g1.getByText(M.g1Hint)).toBeVisible({ timeout: 20_000 });
    await g1.getByRole("button", { name: "Save", exact: true }).click();
    await correct(g1, "The second room is not for rent");
    await expect(g1.getByRole("status")).toContainText(`by ${fixture.leader.name}`, { timeout: 20_000 });
    const g7 = photos(leader, true);
    const removed = g7.getByRole("region", { name: "Removed photos", exact: true });
    await expect(removed.getByText(/removed with an identification save/)).toHaveCount(3, { timeout: 30_000 });
    await expect(g7.getByText(/^Space P2 · /)).toHaveCount(0);
  });

  test("read-only after a newer visit: the photos and the viewer only", async () => {
    await mainArea(leader).getByRole("link", { name: "Back to the lead" }).click();
    await expectLeadDetail(leader, L14);
    const section = surveySection(leader);
    await section.getByRole("button", { name: "Book re-survey", exact: true }).click();
    const resurvey = dialog(leader, "Book re-survey");
    // Thirty minutes ahead: a visit may be recorded from 60 minutes before the start (survey-schedule E-7), and the
    // leader holds no other appointment then, so no overlap warning.
    await field(resurvey, "Start (Vietnam time)").fill(vietnamInput(minutesAhead(30)));
    await field(resurvey, "Re-survey reason").fill("Owner split the ground floor");
    await resurvey.getByRole("button", { name: "Save", exact: true }).click();
    await expect(resurvey).toHaveCount(0, { timeout: 20_000 });
    await expect(section).toContainText("Re-survey #2", { timeout: 20_000 });
    await section.getByRole("button", { name: "Record visit", exact: true }).click();
    const visit = dialog(leader, "Record visit");
    await field(visit, "Visit note").fill("Second visit for the new layout");
    await visit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(visit).toHaveCount(0, { timeout: 20_000 });

    // Checklist #1 belongs to visit #1, an earlier appointment now: open it by its address.
    await leader.goto(checklistPath(checklistId));
    await expect(byText(leader, M.newerVisit)).toBeVisible({ timeout: 20_000 });
    const g7 = photos(leader, false);
    await expect(card(g7, 2).getByAltText("Photo #2", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(uploadForm(g7)).toHaveCount(0);
    await expect(g7.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await card(g7, 2).getByRole("button", { name: "Open photo #2" }).click();
    const viewer = leader.getByRole("dialog");
    await expect(viewer.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
    await expect(viewer.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  });

  test("SM-FE-10: no photo request of the run sent a cookie (credentials omitted)", async () => {
    // Every photo request of the three pages, the content PUT by XMLHttpRequest included, went without a Cookie header,
    // although the browser holds cookies it would send to the API's host if a request included them.
    // Each kind below is proved by a request whose headers came. One that never got them is left out, and only a read
    // (or its preflight) may be one: every write stays checked.
    const seen = (await Promise.all(mediaRequests.map((all) => all()))).flat();
    const unsettled = seen.filter((request) => request.cookie === null);
    expect(
      unsettled.filter((request) => request.method !== "GET" && request.method !== "OPTIONS"),
      `writes among the ${unsettled.length} requests whose headers never came`,
    ).toEqual([]);
    const requests = seen.filter((request) => request.cookie !== null);
    const kinds = new Set(requests.map((request) => `${request.method} ${request.path.replace(/[0-9A-Z]{26}/g, "{id}")}`));
    for (const kind of [
      "GET /api/v1/staff/survey-checklists/{id}/media",
      "POST /api/v1/staff/survey-checklists/{id}/media",
      "PUT /api/v1/staff/survey-media/{id}/content",
      "GET /api/v1/staff/survey-media/{id}/content/thumbnail",
      "GET /api/v1/staff/survey-media/{id}/content/preview",
      "GET /api/v1/staff/survey-media/{id}/content/full",
      "POST /api/v1/staff/survey-media/{id}/hold",
      "POST /api/v1/staff/survey-media/{id}/hold-release",
      "POST /api/v1/staff/survey-media/{id}/removal",
    ]) {
      expect([...kinds], `a ${kind} request was seen`).toContain(kind);
    }
    expect(requests.filter((request) => request.cookie && request.method !== "OPTIONS")).toEqual([]);
    expect((await saleContext.cookies(API_URL)).length, "cookies the browser holds for the API's host").toBeGreaterThan(0);
  });
});
