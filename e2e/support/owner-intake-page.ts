import { expect, type Page, type Response } from "@playwright/test";

export const PATH = "/list-with-us";
export const SUBMIT_PATH = "/api/v1/public/owner-intake-requests";
export const REQUEST_CODE = /^SV-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

export type OwnerIntakeInput = {
  contactName: string;
  phone: string;
  /** Option label of "Nhu cầu". */
  intent: string;
  /** Part of the ward option label, e.g. "Hải Châu" (options read "Phường Hải Châu"). */
  ward: string;
  addressDetail: string;
};

/** Fake data with an address unique to this run and test, so runs never replay each other. */
export function fakeInput(tag: string): OwnerIntakeInput {
  const stamp = Date.now();
  return {
    contactName: "Nguyễn Văn Thử",
    // A valid VN mobile shape (10 digits); the last 7 come from the clock.
    phone: `090${String(stamp).slice(-7)}`,
    intent: "Cho thuê dài hạn",
    ward: "Hải Châu",
    addressDetail: `E2E ${tag} ${stamp}, 12 Đường Thử Nghiệm`,
  };
}

export const isSubmitRequest = (url: string, method: string) =>
  method === "POST" && new URL(url).pathname === SUBMIT_PATH;

/** Selects the first option whose text contains `text`, once the select has loaded its options. */
async function selectOptionContaining(page: Page, label: string, text: string) {
  const select = page.getByLabel(label);
  await expect(select).toBeEnabled();
  const option = select.locator("option", { hasText: text }).first();
  const value = await option.getAttribute("value");
  expect(value, `no "${text}" option in ${label}`).toBeTruthy();
  await select.selectOption(value!);
}

export async function fillForm(page: Page, input: OwnerIntakeInput) {
  await page.getByLabel("Họ tên").fill(input.contactName);
  await page.getByLabel("Số điện thoại").fill(input.phone);
  await page.getByLabel("Nhu cầu").selectOption({ label: input.intent });

  // Đà Nẵng is picked for the owner when it is the only province (BR-12); choose it otherwise.
  const province = page.getByLabel("Tỉnh/thành");
  await expect(province).toBeEnabled();
  if ((await province.inputValue()) === "") await selectOptionContaining(page, "Tỉnh/thành", "Đà Nẵng");
  await selectOptionContaining(page, "Xã/phường", input.ward);

  await page.getByLabel("Địa chỉ chi tiết").fill(input.addressDetail);
  await page.getByLabel("Đồng ý liên hệ").check();
}

export const submitButton = (page: Page) => page.getByRole("button", { name: "Gửi yêu cầu ký gửi", exact: true });

/** Submits and returns the POST response with the request code shown on the success screen. */
export async function submitAndReadCode(page: Page): Promise<{ response: Response; code: string }> {
  const responsePromise = page.waitForResponse((response) =>
    isSubmitRequest(response.url(), response.request().method()),
  );
  await submitButton(page).click();
  const response = await responsePromise;
  // Fail on the answer itself, not on a missing success heading.
  expect(response.status(), `POST ${SUBMIT_PATH} answered ${response.status()}: ${await response.text()}`).toBe(202);
  await expect(page.getByRole("heading", { name: "Đã gửi yêu cầu" })).toBeVisible();
  const code = (await page.locator("output").textContent())?.trim() ?? "";
  return { response, code };
}
