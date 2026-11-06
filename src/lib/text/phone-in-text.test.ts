import { describe, expect, it } from "vitest";

import { containsPhoneNumber } from "./phone-in-text";

// The vectors of the server's PhoneNumberDetectorTest (spec A-14, W15-7): the UI refuses what the server refuses.
describe("containsPhoneNumber (survey BR-4, spec A-14)", () => {
  it.each([
    "0905 123 456",
    "+84.905.123.456",
    "(+84) 905 123 456",
    "84905123456",
    "0236 3812 345",
    "gọi 0905-123-456 nhé",
    "(0236) 3812-345",
    "SĐT:0905123456.",
  ])("finds %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each([
    "0905 123 456",
    "0905 123 456",
    "0905 123 456",
    "０９０５１２３４５６",
    "gọi +84 905 123 456",
  ])("finds a number with other spaces or full-width digits: %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each([
    "0905–123–456",
    "0905 – 123 – 456",
    "0905‑123‑456",
    "0905—123—456",
    "0905−123−456",
    "0905​123​456",
    "0905­123­456",
    "0905⁠123⁠456",
  ])("finds a number split by dashes or invisible characters: %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each([
    "tầng 12, căn 1203",
    "K12/5 Lê Duẩn",
    "25-10-2026",
    "25–10–2026",
    "",
    "   ",
    "giá 15 000 000 đồng",
    "0905 123 45",
    "10:00 - 11:30",
    "mã 1090512345678",
  ])("does not flag %j", (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
  });
});
