import { describe, expect, it } from "vitest";

import { copyText } from "./copy-text";

describe("copyText", () => {
  it("is copied when the clipboard takes the text", async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (text: string) => void written.push(text) };
    await expect(copyText("SV-7K3M-Q9TX", clipboard)).resolves.toBe("copied");
    expect(written).toEqual(["SV-7K3M-Q9TX"]);
  });

  it("fails without throwing when the clipboard refuses", async () => {
    const clipboard = { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) };
    await expect(copyText("SV-7K3M-Q9TX", clipboard)).resolves.toBe("failed");
  });

  it("fails without throwing when there is no clipboard (plain http)", async () => {
    await expect(copyText("SV-7K3M-Q9TX", undefined)).resolves.toBe("failed");
  });
});
