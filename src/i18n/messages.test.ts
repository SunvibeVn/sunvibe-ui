import { describe, expect, it } from "vitest";
import vi from "./messages/vi.json";
import { defaultLocale } from "./config";

describe("i18n config", () => {
  it("uses the single Vietnamese locale (D-15, C-FE-1)", () => {
    expect(defaultLocale).toBe("vi");
  });
});

describe("vi.json OwnerIntake verbatim brief texts", () => {
  const m = vi.OwnerIntake;

  it("has the BR-12 service-area notice", () => {
    expect(m.serviceArea).toBe("Hiện Sunvibe nhận ký gửi tại TP. Đà Nẵng");
  });

  it("has the BR-12 confirmation text", () => {
    expect(m.success.confirmation).toBe(
      "Sunvibe đã nhận thông tin và sẽ liên hệ lại. Thông tin của bạn chưa được đăng công khai.",
    );
  });

  it("has the E-5 rate-limit text", () => {
    expect(m.errors.rateLimited).toBe("Bạn đã gửi quá nhiều lần, vui lòng thử lại sau.");
  });

  it("has the BR-9 consent notice (version owner-intake-2026-10)", () => {
    expect(m.consent.notice).toBe(
      "Tôi đồng ý để Sunvibe lưu và sử dụng thông tin tôi cung cấp (họ tên, số điện thoại, email, địa chỉ, vị trí bất động sản) nhằm liên hệ tư vấn dịch vụ môi giới cho thuê/bán. Thông tin không được đăng công khai khi chưa có sự đồng ý của tôi. Tôi có thể yêu cầu sửa hoặc xóa thông tin bất cứ lúc nào qua email services@sunvibe.vn hoặc hotline 0917579123.",
    );
  });

  it("labels the consent checkbox with the BR-1 field name, not a second copy of the notice", () => {
    expect(m.consent.label).toBe("Đồng ý liên hệ");
    expect(m.consent.notice.startsWith(m.consent.label)).toBe(false);
  });

  it("fills the special-zone notice with the ward name instead of a hardcoded one", () => {
    expect(m.map.specialZone).toContain("{name}");
    expect(JSON.stringify(m)).not.toContain("Hoàng Sa");
  });

  it("has the OpenStreetMap attribution", () => {
    expect(m.map.attribution).toBe("© OpenStreetMap contributors");
  });

  it("has the support code with the correlationId placeholder", () => {
    expect(m.errors.supportCode).toBe("Mã hỗ trợ: {correlationId}");
  });
});
