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

  // Pin rows P-1 to P-10 of the vector table (phone detector spec 2026-11-15, section 5): today's answers, kept.
  it.each([
    "giá 15.000.000 đồng",
    "1.250.000",
    "T3-01.05",
    "từ 08:30 đến 17:00",
    "06.11.2026-07.11.2026",
    "2026-11-06 09:00",
  ])("keeps today's answer: not a number %j", (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
  });

  it.each([
    "84.000.000.000",
    "Owner mobile 0905 123 456",
    "Call the owner on 0901 234 567",
    "0901234567",
  ])("keeps today's answer: a number %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  // Rows R-1 to R-10 of the vector table (phone detector spec 2026-11-15, section 5; SV-212).
  it.each([
    "Gặp chủ 06.11.2026 09:00",
    "Gặp chủ 06.11.2026 09h00",
    "Gặp chủ 06-11-2026 10 giờ",
    "Gặp chủ 06. 11. 2026 09:00",
  ])("does not flag a date with a time: %j", (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
  });

  it.each([
    "Tầng 3 0905 123 456",
    "0905 123 456 15 phút",
    "06.11.2026 0905 123 456",
    "Gặp chủ 06.11.2026 09:00, gọi 0905123456",
  ])("finds a number right after another number: %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each(["SĐT1:0905123456", "0905123456:15"])("finds a number next to a colon: %s", (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });
});
