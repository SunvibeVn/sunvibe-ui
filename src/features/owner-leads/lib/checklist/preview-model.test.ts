import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { emptyContent, ownerMeta, P1, P2, siteMeta, sourced, viewOf, B } from "./fixtures.test-support";
import { previewModel, previewSections } from "./preview-model";

// A missing message fails the test (the page would log an IntlError for it).
const translator = createTranslator({
  locale: "en",
  messages: en,
  namespace: "OwnerLeads",
  onError: (error) => {
    throw error;
  },
});
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

function filled() {
  const content = emptyContent();
  content.dimensions.spaces![0].area = { ...sourced("VALUE", 35.5, "MEASURED"), meta: siteMeta({ lastSource: "MEASURED" }) } as never;
  content.dimensions.spaces![1].bedrooms = {
    ...sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: B }),
    meta: ownerMeta(B, "2026-10-20", B),
  } as never;
  content.identification.generalNote = "Blue gate";
  content.identification.fieldMeta = { ...content.identification.fieldMeta, generalNote: siteMeta({ observedByUserId: null, lastSource: null }) };
  content.amenities.sharedItems = [
    { code: "AIR_CONDITIONER", presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null, meta: siteMeta() },
  ];
  return content;
}

describe("previewSections (spec 6.2 Preview, W16-31; the read-only Edit and the snapshot view)", () => {
  it("lists every group and space with each value or state and its provenance line", () => {
    const view = viewOf(filled());
    const sections = previewSections(view.groups!, view, t);
    expect(sections.map((section) => section.group)).toEqual([
      "identification",
      "parts",
      "dimensions",
      "condition",
      "safety",
      "amenities",
      "evidence",
      "terms",
    ]);
    const dims = sections.find((section) => section.group === "dimensions")!;
    expect(dims.spaces.map((space) => space.code)).toEqual(["P1", "P2"]);
    const area = dims.spaces[0].rows.find((row) => row.field === "area")!;
    expect(area.text).toBe("35.5 m2");
    expect(area.provenance[0]).toBe("Measured at survey #1 by Anh Sale, 23/10/2026");
    const bedrooms = dims.spaces[1].rows.find((row) => row.field === "bedrooms")!;
    expect(bedrooms.provenance[0]).toBe("Owner said on 20/10/2026 (heard by Binh Leader)");
    expect(dims.spaces[1].rows.find((row) => row.field === "area")!.text).toBe("Not checked");

    const note = sections[0].asset.find((row) => row.field === "generalNote")!;
    expect(note.provenance).toEqual(["Note by Anh Sale, 23/10/2026"]);

    const amenities = sections.find((section) => section.group === "amenities")!;
    expect(amenities.asset.find((row) => row.key === "amenities/sharedItems/AIR_CONDITIONER")!.text).toBe("Air conditioner: Yes");

    const terms = sections.find((section) => section.group === "terms")!;
    expect(terms.asset.find((row) => row.field === "electricity")!.text).toBe("Not confirmed");
    expect(terms.spaces[0].rows.some((row) => row.key.includes("chargeOverrides"))).toBe(false);
  });

  it("builds the same sections from a checkpoint's groups", () => {
    const view = viewOf(filled());
    const snapshot = { identification: view.groups!.identification, dimensions: view.groups!.dimensions };
    const sections = previewSections(snapshot, view, t);
    expect(sections.find((section) => section.group === "dimensions")!.spaces[0].rows[0].text).toBe("35.5 m2");
  });
});

describe("previewModel", () => {
  it("adds the effective terms with their origin and the gap links", () => {
    const view = viewOf(filled(), 1, {
      readiness: {
        submissionAvailable: false,
        missing: [{ group: "CONDITION", spaceId: P2, field: "kitchen", problem: "REQUIRED_AREA_NOT_ENTERED" }],
        unconfirmedTerms: [],
        warnings: [],
      },
      effectiveTerms: [
        {
          spaceId: P1,
          electricity: { term: sourced("VALUE", { basis: "INCLUDED", amount: null, chargeUnit: null, note: null }, "OBSERVED_ON_SITE") as never, origin: "SPACE" },
          water: { term: sourced() as never, origin: "COMMON" },
          internet: { term: sourced() as never, origin: "COMMON" },
          parking: { term: sourced() as never, origin: "COMMON" },
          serviceFee: { term: sourced() as never, origin: "COMMON" },
          fees: { common: sourced("VALUE", [], "OBSERVED_ON_SITE") as never, space: null },
        },
      ],
    });
    const model = previewModel(view, t);
    expect(model.gaps).toEqual([
      { text: "Condition and availability · P2 · Kitchen: Not entered or only partly entered: Kitchen", anchor: `cl-condition-${P2}-kitchen` },
    ]);
    expect(model.effective[0].charges[0]).toEqual({ label: "Electricity", text: "Included", origin: "this space" });
    expect(model.effective[0].charges[1]).toEqual({ label: "Water", text: "Not confirmed", origin: "common value" });
  });
});
