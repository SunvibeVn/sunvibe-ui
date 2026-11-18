import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { historyActorText, historyEventText } from "./history-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("history texts (brokerage-agreement E05-S7, S7-D7, S7-D8, spec section 6)", () => {
  it("historyText_everyEvent_hasEnglishText: each of the ten event codes and OTHER reads its text", () => {
    const table: [string, string][] = [
      ["CREATED", "Agreement drafted"],
      ["DRAFT_EDITED", "Draft edited"],
      ["VERSION_SENT", "Sent to the owner"],
      ["OWNER_CONFIRMED", "Confirmed by the owner"],
      ["OWNER_REJECTED", "Declined by the owner"],
      ["VERSION_LAPSED", "Lapsed"],
      ["DRAFT_OPENED", "New draft opened"],
      ["ACTIVATED", "Activated"],
      ["ACTIVATION_REFUSED", "Activation refused"],
      ["VERSION_STARTED", "Took effect"],
      ["OTHER", "Another event"],
    ];
    for (const [code, text] of table) {
      expect(historyEventText(code)).toBe(`history.events.${code}`);
      expect(t(historyEventText(code))).toBe(text);
    }
  });

  it("historyText_unknownEvent_anotherEvent: a code the UI does not know, or none, reads Another event", () => {
    for (const code of ["CONTRACT_TERMINATED", "created", "", "toString", undefined]) {
      expect(historyEventText(code)).toBe("history.events.OTHER");
    }
    expect(t(historyEventText("CONTRACT_TERMINATED"))).toBe("Another event");
  });

  it("historyText_actors_nameOrFixedText: a staff member by the name the server gives, else A staff member; the owner and Sunvibe by fixed texts; an unknown actor type shows nothing", () => {
    expect(historyActorText("STAFF", "Tran Thi B")).toEqual({ name: "Tran Thi B" });
    expect(historyActorText("STAFF", null)).toEqual({ key: "history.actors.staffUnknown" });
    expect(historyActorText("STAFF", undefined)).toEqual({ key: "history.actors.staffUnknown" });
    expect(historyActorText("STAFF", "  ")).toEqual({ key: "history.actors.staffUnknown" });
    expect(historyActorText("OWNER", "Someone")).toEqual({ key: "history.actors.owner" });
    expect(historyActorText("SYSTEM", null)).toEqual({ key: "history.actors.system" });
    expect(historyActorText("ROBOT", "Someone")).toBeNull();
    expect(historyActorText(undefined, "Someone")).toBeNull();

    expect(t("history.actors.staffUnknown")).toBe("A staff member");
    expect(t("history.actors.owner")).toBe("The owner");
    expect(t("history.actors.system")).toBe("Sunvibe (automatic)");
  });
});
