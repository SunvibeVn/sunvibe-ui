import { expect, test } from "@playwright/test";

import { API_UNAVAILABLE_REASON, isApiAvailable } from "./support/api";
import {
  fakeInput,
  fillForm,
  isSubmitRequest,
  PATH,
  REQUEST_CODE,
  submitAndReadCode,
  submitButton,
} from "./support/owner-intake-page";

// Needs no API: only the rendered markup.
test("a submit before hydration cannot put the owner's data in the URL", async ({ page }) => {
  await page.goto(PATH);
  const form = page.locator("form").filter({ has: submitButton(page) });
  await expect(form).toHaveAttribute("method", "post");
  await expect(form.locator("[name]")).toHaveCount(0);
});

// Needs no API: the options are static. Rental only (brief Q-14, G2 D-45).
test("the need select offers the two rentals and no sale", async ({ page }) => {
  await page.goto(PATH);
  const options = page.getByLabel("Nhu cầu").locator("option");
  await expect(options).toHaveText(["Chọn nhu cầu", "Cho thuê ngắn hạn", "Cho thuê dài hạn"]);
});

test.describe("with the API", () => {
  // Every spec needs the API: the client-only field error too, because the submit stays disabled until the
  // province and ward catalogs have loaded. At most 3 POSTs per run (rate limit 10).
  test.beforeEach(async ({ page }) => {
    test.skip(!(await isApiAvailable()), API_UNAVAILABLE_REASON);
    await page.goto(PATH);
  });

  test("happy path shows the request code", async ({ page }) => {
    await fillForm(page, fakeInput("happy"));

    const { response, code } = await submitAndReadCode(page);

    expect(response.status()).toBe(202);
    expect(code).toMatch(REQUEST_CODE);
    await expect(
      page.getByText("Sunvibe đã nhận thông tin và sẽ liên hệ lại. Thông tin của bạn chưa được đăng công khai."),
    ).toBeVisible();
  });

  test("a bad phone shows its error on the input and sends nothing", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (isSubmitRequest(request.url(), request.method())) posts.push(request.url());
    });
    await fillForm(page, { ...fakeInput("bad-phone"), phone: "0123" });

    await submitButton(page).click();

    const phone = page.getByLabel("Số điện thoại");
    await expect(page.locator("#phone-error")).toHaveText(
      "Số điện thoại không hợp lệ. Vui lòng nhập số Việt Nam 10 chữ số.",
    );
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(phone).toHaveAttribute("aria-describedby", "phone-error");
    await expect(phone).toBeFocused();
    expect(posts).toEqual([]);
  });

  test("the same body sent again within 5 minutes returns the same code", async ({ page }) => {
    const input = fakeInput("replay");
    await fillForm(page, input);
    const first = await submitAndReadCode(page);
    expect(first.code).toMatch(REQUEST_CODE);

    await page.getByRole("button", { name: "Gửi yêu cầu ký gửi khác" }).click();
    await fillForm(page, input);
    const second = await submitAndReadCode(page);

    expect(second.response.status()).toBe(202);
    expect(second.code).toBe(first.code);
    expect(await second.response.headerValue("idempotent-replayed")).toBe("true");
  });
});
