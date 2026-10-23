import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { assigneeFilterLabel } from "../components/assignee-filter-label";

import { assigneeOption } from "./assignee-option";
import { HISTORY_ACTOR_KEY, historyActor } from "./history-actor";
import type { OwnerLeadsKey } from "./labels";

// The workspace texts of spec 5.5 as the English UI renders them (W14-35): the same messages and ICU formatting.
const t = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const text = (key: OwnerLeadsKey, values?: Record<string, string>) => t(key, values);

describe("English assignee filter labels (C-34, spec 5.5)", () => {
  it("assigneeFilterLabel gives '<name> (no longer takes leads)' and 'Other staff member'", () => {
    const former = assigneeFilterLabel("U9", [], [{ assignedUserId: "U9", assignedUserName: "Lê Văn Cũ", lastActivityAt: "2026-10-20T03:00:00Z" }]);
    expect(former).toEqual({ name: "Lê Văn Cũ", formerHolder: true });
    expect(text("filters.assigneeFormer", { name: former?.name ?? "" })).toBe("Lê Văn Cũ (no longer takes leads)");
    expect(assigneeFilterLabel("U8", [], [])).toBeNull();
    expect(text("filters.assigneeOther")).toBe("Other staff member");
  });
});

describe("English history actors (BR-8)", () => {
  it("historyActor returns the Owner, System and Unknown keys", () => {
    expect(HISTORY_ACTOR_KEY).toEqual({
      owner: "history.actorOwner",
      system: "history.actorSystem",
      unknown: "history.actorUnknown",
    });
    expect(text(HISTORY_ACTOR_KEY[historyActor({ type: "SUBMITTED" }).kind as "owner"])).toBe("Owner");
    expect(text(HISTORY_ACTOR_KEY[historyActor({ type: "AUTO_ASSIGNED" }).kind as "system"])).toBe("System");
    expect(text(HISTORY_ACTOR_KEY[historyActor({ type: "NOTE_ADDED" }).kind as "unknown"])).toBe("Unknown");
  });
});

describe("English assignee options (C-29)", () => {
  it("assigneeOptionLabel reads 'Name · Sale' and 'Name · Sale leader'", () => {
    const sale = assigneeOption({ userId: "U1", fullName: "Nguyễn An", roles: ["SALE"] });
    const leader = assigneeOption({ userId: "U2", fullName: "Trần Bình", roles: ["SALE", "SALE_LEADER"] });
    expect(text("assignDialog.assigneeOption", { name: sale.name ?? "", role: text(sale.roleKey) })).toBe("Nguyễn An · Sale");
    expect(text("assignDialog.assigneeOption", { name: leader.name ?? "", role: text(leader.roleKey) })).toBe(
      "Trần Bình · Sale leader",
    );
  });
});

describe("English price and errors (A-10, spec 5.5)", () => {
  it("has the 404 and 409 texts", () => {
    expect(text("errors.leadNotFound")).toBe("Lead not found, or you can no longer see it.");
    expect(text("errors.concurrent")).toMatch(/^Someone else just updated this lead\./);
  });

  it("counts leads in English", () => {
    expect(t("list.total", { count: 1 })).toBe("1 lead");
    expect(t("list.total", { count: 21 })).toBe("21 leads");
    // The e2e list wait (e2e/workspace/support/staff.ts) matches this grouping.
    expect(t("list.total", { count: 1000 })).toBe("1,000 leads");
  });
});
