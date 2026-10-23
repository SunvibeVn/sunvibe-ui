import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { englishSessionTexts } from "@/features/auth/client";
import en from "./messages/en.json";
import vi from "./messages/vi.json";
import { defaultLocale, locales } from "./config";

/** The six property types of intake brief BR-3, in form order, with their labels (G2 D-46, D-47). */
const PROPERTY_TYPE_LABELS = [
  ["HOUSE", "Nhà nguyên căn"],
  ["WHOLE_BUILDING", "Tòa nhà / tòa căn hộ"],
  ["VILLA", "Villa"],
  ["HOMESTAY", "Homestay"],
  ["CONDOTEL", "Condotel (căn hộ khách sạn)"],
  ["APARTMENT", "Căn hộ chung cư"],
];

describe("i18n config", () => {
  it("defaults to Vietnamese; English only for the staff workspace (D-15, C-41)", () => {
    expect(defaultLocale).toBe("vi");
    expect([...locales]).toEqual(["vi", "en"]);
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

  it("has the BR-9 consent notice (version owner-intake-2026-10-21, rental only)", () => {
    expect(m.consent.notice).toBe(
      "Tôi đồng ý để Sunvibe lưu và sử dụng thông tin tôi cung cấp (họ tên, số điện thoại, email, địa chỉ, vị trí bất động sản) nhằm liên hệ tư vấn dịch vụ môi giới cho thuê. Thông tin không được đăng công khai khi chưa có sự đồng ý của tôi. Tôi có thể yêu cầu sửa hoặc xóa thông tin bất cứ lúc nào qua email services@sunvibe.vn hoặc hotline 0917579123.",
    );
  });

  it("does not invite owners to sell on the page (Q-14, D-45)", () => {
    expect(m.page.description).not.toMatch(/bán/i);
    expect(m.page.intro).not.toMatch(/bán/i);
  });

  it("offers no sale option in the need select (Q-14, D-45)", () => {
    expect(Object.keys(m.fields.intent.options)).toEqual(["SHORT_TERM_RENT", "LONG_TERM_RENT"]);
  });

  it("has the owner's page description and intro, without land (D-47)", () => {
    const text = "Đăng ký thông tin bất động sản cần cho thuê; Sunvibe sẽ liên hệ tư vấn và hỗ trợ Quý khách.";
    expect(m.page.description).toBe(text);
    expect(m.page.intro).toBe(text);
    expect(m.page.description).not.toMatch(/đất/i);
    expect(m.page.intro).not.toMatch(/đất/i);
  });

  it("offers the six property types of BR-3 in order, with no other or land option (Q-16, D-47)", () => {
    expect(Object.entries(m.fields.propertyType.options)).toEqual(PROPERTY_TYPE_LABELS);
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

/** Every leaf string of a message tree, with its dotted path. */
function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
}

/** Every dotted key path of a message tree (leaves only). */
function keyPaths(node: unknown): string[] {
  return leaves(node).map(([path]) => path).sort();
}

const VIETNAMESE_LETTER = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
const WORKSPACE_NAMESPACES = ["Workspace", "OwnerLeads", "SaleTerritories"];

describe("en.json, the staff workspace messages (W14-20, W14-21)", () => {
  it("en.json has no Vietnamese letters", () => {
    const vietnamese = leaves(en).filter(([, text]) => VIETNAMESE_LETTER.test(text));
    expect(vietnamese).toEqual([]);
  });

  it("Session keys match in vi and en", () => {
    expect(keyPaths(en.Session)).toEqual(keyPaths(vi.Session));
  });

  it("workspace namespaces only in en", () => {
    expect(Object.keys(en).sort()).toEqual([...WORKSPACE_NAMESPACES, "Session"].sort());
    for (const namespace of WORKSPACE_NAMESPACES) expect(vi).not.toHaveProperty(namespace);
  });

  it("vi.json has the public workspace entry link", () => {
    expect(vi.WorkspaceEntry.link).toBe("Khu làm việc");
  });

  it("takes the English Session texts from englishSessionTexts, no third wording", () => {
    const s = en.Session;
    expect({
      loading: s.loading,
      leaving: s.leaving,
      expiredTitle: s.expired.title,
      expiredBody: s.expired.body,
      expiredLink: s.expired.link,
      unavailableTitle: s.unavailable.title,
      unavailableBody: s.unavailable.body,
      rateLimited: s.unavailable.rateLimited,
      retry: s.unavailable.retry,
      signOutHere: s.unavailable.signOutHere,
      logoutFailed: s.logoutFailed,
      tryAgain: s.tryAgain,
    }).toEqual(englishSessionTexts);
  });

  it("has English 403 texts", () => {
    expect(en.Session.forbidden.title).toBe("You don't have access to this page");
    expect(en.Session.forbidden.link).toBe("Back to home");
    expect(en.Session.forbiddenNotice).toBe("You don't have permission to do this.");
  });
});

describe("no workspace file reads vi.json (W14-20)", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dirs = ["features/owner-leads", "features/workspace", "app/(workspace)"];
  const allowed = new Set([path.join("features", "workspace", "components", "workspace-link.tsx")]);

  function files(dir: string): string[] {
    return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(relative);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path.normalize(relative)] : [];
    });
  }

  it("no workspace source imports vi.json or uses WorkspaceEntry", () => {
    const offenders = dirs
      .flatMap(files)
      .filter((file) => !allowed.has(file))
      .filter((file) => /messages\/vi\.json|WorkspaceEntry/.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("workspace files read only en.json namespaces (no vi-only namespace)", () => {
    const namespaces = new Set(Object.keys(en));
    const offenders = dirs
      .flatMap(files)
      .filter((file) => !allowed.has(file))
      .flatMap((file) =>
        [...readFileSync(path.join(root, file), "utf8").matchAll(/(?:useTranslations|getTranslations)\(\s*"([^".]+)/g)]
          .map((match) => match[1])
          .filter((namespace) => !namespaces.has(namespace))
          .map((namespace) => `${file}: ${namespace}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("en.json OwnerLeads texts of spec 5.5", () => {
  const m = en.OwnerLeads;

  it("has the status labels of C-45", () => {
    expect(m.status).toEqual({
      NEW: "Unassigned",
      ASSIGNED: "Assigned",
      CONTACTED: "Contacted",
      ON_HOLD: "On Hold",
      DUPLICATE: "Duplicate",
      REJECTED: "Declined",
      WITHDRAWN: "Owner Withdrawn",
    });
  });

  it("has the page titles (generic, no name or code, BR-2)", () => {
    expect(m.title).toBe("SUPPLY LEADS");
    expect(m.detail.title).toBe("Lead");
  });

  it("has the intents, property types, ward types and activities", () => {
    expect(m.intent).toEqual({
      SHORT_TERM_RENT: "Short-term rental",
      LONG_TERM_RENT: "Long-term rental",
      SALE: "Sale",
    });
    expect(m.propertyType).toEqual({
      HOUSE: "House",
      WHOLE_BUILDING: "Whole building",
      VILLA: "Villa",
      HOMESTAY: "Homestay",
      CONDOTEL: "Condotel",
      APARTMENT: "Apartment",
    });
    expect(m.wardType).toEqual({ WARD: "Ward", COMMUNE: "Commune", SPECIAL_ZONE: "Special zone" });
    expect(m.activity).toEqual({
      SUBMITTED: "Owner submitted the form",
      AUTO_ASSIGNED: "Auto-assigned by ward",
      ASSIGNED: "Assigned",
      REASSIGNED: "Reassigned",
      STATUS_CHANGED: "Status changed",
      NOTE_ADDED: "Note",
    });
  });

  it("has the list texts", () => {
    expect(m.tabs.mine).toBe("My Leads");
    expect(m.tabs.all).toBe("All Leads");
    expect(m.filters.showClosed).toBe("Show closed leads");
    expect(m.list.possibleDuplicate).toBe("Potential Duplicate");
  });

  it("has the former-holder labels (C-34)", () => {
    expect(m.filters.assigneeFormer).toBe("{name} (no longer takes leads)");
    expect(m.filters.assigneeOther).toBe("Other staff member");
  });

  it("has the history actors (BR-8) and the picker roles", () => {
    expect(m.history.actorOwner).toBe("Owner");
    expect(m.history.actorSystem).toBe("System");
    expect(m.history.actorUnknown).toBe("Unknown");
    expect(m.role).toEqual({ SALE: "Sale", SALE_LEADER: "Sale leader" });
  });

  it("has the error texts of 5.5", () => {
    expect(m.errors.concurrent.startsWith("Someone else just updated this lead.")).toBe(true);
    expect(m.errors.leadNotFound).toBe("Lead not found, or you can no longer see it.");
    expect(m.errors.supportCode).toBe("Support code: {correlationId}");
  });

  it("has the price unit suffixes (A-10)", () => {
    expect(m.priceUnit).toEqual({ NIGHT: "/night", MONTH: "/month", TOTAL: " (sale price)" });
  });
});

describe("en.json Workspace texts", () => {
  const m = en.Workspace;

  it("has the shell and menu names (C-42, C-43, A-4)", () => {
    expect(m.title).toBe("Workspace");
    expect(m.menu.ownerLeads).toBe("SUPPLY LEADS");
    expect(m.menu.territories).toBe("TERRITORIES");
    expect(m.header.signOut).toBe("Sign Out");
  });

  it("has no public entry link or account card (they live outside the workspace)", () => {
    expect(m).not.toHaveProperty("link");
    expect(m).not.toHaveProperty("accountCard");
  });
});

describe("en.json SaleTerritories texts", () => {
  const m = en.SaleTerritories;

  it("has the page title", () => {
    expect(m.title).toBe("TERRITORIES");
  });

  it("has the C-40 flag and the empty holder", () => {
    expect(m.holder.ineligible).toBe("No longer receives leads: new leads go to the unassigned queue");
    expect(m.holder.none).toBe("Not assigned");
  });

  it("states that a change applies to new leads only (US-8 AC-3)", () => {
    expect(m.newLeadsOnly).toContain("new leads");
  });
});
