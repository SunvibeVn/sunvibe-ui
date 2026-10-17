import { expect, test } from "@playwright/test";

// W10-44 (auth-browser-session §4.9, S-8): the server HTML of every auth form carries a non-submitting `javascript:`
// action, never a GET form, so a submit before hydration (or without JavaScript) cannot put a phone number, password
// or code in a URL; without JavaScript the page says why it cannot sign in. Needs no API: only the rendered markup.

const NOSCRIPT_TEXT = "Sunvibe needs JavaScript to sign in. Turn on JavaScript in your browser, then reload this page.";

const AUTH_PAGES = ["/login", "/sign-up", "/forgot-password", "/reset-password?token=x"] as const;

// Without JavaScript the page is exactly the server HTML: nothing hydrates or replaces the form's attributes.
test.use({ javaScriptEnabled: false, trace: "off" });

for (const path of AUTH_PAGES) {
  test(`the server-rendered form on ${path} cannot submit before hydration`, async ({ page }) => {
    await page.goto(path);

    // Streamed sections may stay hidden without JavaScript; the attributes are what the browser would submit with.
    const forms = page.locator("form");
    await expect(forms.first()).toBeAttached();
    const count = await forms.count();
    for (let i = 0; i < count; i += 1) {
      const form = forms.nth(i);
      expect(await form.getAttribute("action"), `form ${i} action on ${path}`).toMatch(/^javascript:/);
      expect((await form.getAttribute("method")) ?? "", `form ${i} method on ${path}`).not.toMatch(/^get$/i);
    }

    // Read from the HTML itself: Chromium with scripts disabled by Playwright still parses <noscript> as raw text.
    const html = await (await page.request.get(path)).text();
    const noscripts = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((match) => match[1]);
    expect(noscripts.some((content) => content.includes(NOSCRIPT_TEXT)), `<noscript> note on ${path}`).toBe(true);
  });
}
