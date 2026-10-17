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

  it("keeps the map attribution out of the messages (Leaflet renders it as HTML; see lib/map-tiles.ts)", () => {
    expect(m.map).not.toHaveProperty("attribution");
  });

  it("has the support code with the correlationId placeholder", () => {
    expect(m.errors.supportCode).toBe("Mã hỗ trợ: {correlationId}");
  });
});

describe("vi.json Session verbatim spec §7 texts (W10-46)", () => {
  const m = vi.Session;

  it("has the 401 screen title", () => {
    expect(m.expired.title).toBe("Phiên đăng nhập đã hết hạn");
  });

  it("has the 401 screen body", () => {
    expect(m.expired.body).toBe("Vui lòng đăng nhập lại để tiếp tục.");
  });

  it("has the 401 screen link", () => {
    expect(m.expired.link).toBe("Đăng nhập lại");
  });

  it("has the 403 screen title", () => {
    expect(m.forbidden.title).toBe("Bạn không có quyền truy cập trang này");
  });

  it("has the 403 screen body", () => {
    expect(m.forbidden.body).toBe(
      "Tài khoản của bạn chưa được cấp quyền cho trang này. Hãy liên hệ quản trị viên nếu bạn cần quyền.",
    );
  });

  it("has the 403 screen link", () => {
    expect(m.forbidden.link).toBe("Về trang chủ");
  });

  it("has the inline 403 notice", () => {
    expect(m.forbiddenNotice).toBe("Bạn không có quyền thực hiện thao tác này.");
  });

  it("has the unavailable block title", () => {
    expect(m.unavailable.title).toBe("Không kết nối được máy chủ");
  });

  it("has the unavailable block body", () => {
    expect(m.unavailable.body).toBe("Chưa tải được phiên đăng nhập. Bạn vẫn đang đăng nhập.");
  });

  it("has the unavailable retry button", () => {
    expect(m.unavailable.retry).toBe("Thử lại");
  });

  it("has the unavailable sign-out button", () => {
    expect(m.unavailable.signOutHere).toBe("Đăng xuất trên thiết bị này");
  });

  it("has the 429 text with the {n} seconds placeholder", () => {
    expect(m.unavailable.rateLimited).toBe("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau {n} giây.");
  });

  it("has the loading text", () => {
    expect(m.loading).toBe("Đang tải…");
  });

  it("has the leaving text", () => {
    expect(m.leaving).toBe("Đang chuyển tới trang đăng nhập…");
  });
});
