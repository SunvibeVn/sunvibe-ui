import { describe, expect, it } from "vitest";
import { maskPhone, signUpSentTo } from "./mask-phone";

describe("maskPhone", () => {
  it("keeps the first and last three digits", () => {
    expect(maskPhone("0912345678")).toBe("091••••678");
    expect(maskPhone("091234567890")).toBe("091••••••890");
  });

  it("hides a number too short to mask partly", () => {
    expect(maskPhone("12345")).toBe("•••••");
  });
});

describe("signUpSentTo", () => {
  it("shows the address the visitor typed and masks a number", () => {
    expect(signUpSentTo({ channel: "EMAIL", email: "an@sunvibe.vn" })).toBe("an@sunvibe.vn");
    expect(signUpSentTo({ channel: "PHONE", phone: "0901234567" })).toBe("090••••567");
  });
});
