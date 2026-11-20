import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import type { ListingFeatures } from "../types";

import { RevisionFeaturesSection } from "./revision-features-section";

const f = en.ListingPublish.revision.features;

const NOTHING_CHOSEN: ListingFeatures = {
  furnishing: null,
  airConditioner: false,
  waterHeater: false,
  fridge: false,
  washingMachine: null,
  kitchen: null,
  balcony: false,
  elevator: false,
  motorbikeParking: false,
  carParking: false,
  internet: false,
  pets: null,
  noSharedLandlord: false,
};

/** Listing BR-3's Vietnamese feature words: the staff panel shows none of them (E06S2-D17, G2 D-48). */
const VIETNAMESE_LABELS = [
  "Nội thất",
  "Máy lạnh",
  "Bình nóng lạnh",
  "Tủ lạnh",
  "Máy giặt",
  "Bếp",
  "Ban công",
  "Thang máy",
  "Chỗ để xe máy",
  "Chỗ để ô tô",
  "Thú cưng",
  "Không chung chủ",
];

const OPTIONS: [keyof typeof f.labels, string[]][] = [
  ["furnishing", [f.options.FULL, f.options.BASIC, f.options.NONE, f.options.notStated]],
  ["washingMachine", [f.options.PRIVATE, f.options.SHARED, f.options.notStated]],
  ["kitchen", [f.options.PRIVATE, f.options.SHARED, f.options.notStated]],
  ["pets", [f.options.ALLOWED, f.options.NOT_ALLOWED, f.options.notStated]],
];

const YES_FEATURES = [
  "airConditioner",
  "waterHeater",
  "fridge",
  "balcony",
  "elevator",
  "motorbikeParking",
  "carParking",
  "internet",
  "noSharedLandlord",
] as const;

function renderSection(values: ListingFeatures, onChange = vi.fn<(next: ListingFeatures) => void>(), disabled = false) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <RevisionFeaturesSection values={values} onChange={onChange} disabled={disabled} />
    </NextIntlClientProvider>,
  );
  return { ...view, onChange };
}

describe("RevisionFeaturesSection (listing-publish E06-S2, spec section 6, E06S2-D5, D17)", () => {
  it("revisionFeaturesSection_labels_englishOnly: every label is its en.json text, an option feature offers 'Not stated', and no Vietnamese label is rendered", () => {
    const { container } = renderSection(NOTHING_CHOSEN);

    const section = screen.getByRole("group", { name: f.heading });
    for (const [name, options] of OPTIONS) {
      const group = within(section).getByRole("group", { name: f.labels[name] });
      const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
      expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual(options);
      expect(radios.map((radio) => radio.checked)).toEqual([...options.slice(1).map(() => false), true]);
    }
    for (const name of YES_FEATURES) {
      const box = within(section).getByRole("checkbox", { name: f.labels[name] }) as HTMLInputElement;
      expect(box.checked).toBe(false);
    }
    expect(within(section).getAllByRole("checkbox")).toHaveLength(9);
    expect(within(section).getAllByRole("radio")).toHaveLength(13);
    for (const word of VIETNAMESE_LABELS) expect(container.textContent).not.toContain(word);
  });

  it("revisionFeaturesSection_choose_onChangeValues: a choice or a box answers the whole features with that one changed; 'Not stated' answers null", () => {
    const chosen: ListingFeatures = { ...NOTHING_CHOSEN, kitchen: "PRIVATE", fridge: true };
    const { onChange } = renderSection(chosen);

    expect((within(screen.getByRole("group", { name: f.labels.kitchen })).getByRole("radio", { name: f.options.PRIVATE }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: f.labels.fridge }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(screen.getByRole("group", { name: f.labels.furnishing })).getByRole("radio", { name: f.options.BASIC }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, furnishing: "BASIC" });

    fireEvent.click(within(screen.getByRole("group", { name: f.labels.kitchen })).getByRole("radio", { name: f.options.notStated }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, kitchen: null });

    fireEvent.click(screen.getByRole("checkbox", { name: f.labels.airConditioner }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, airConditioner: true });

    fireEvent.click(screen.getByRole("checkbox", { name: f.labels.fridge }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, fridge: false });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("revisionFeaturesSection_disabled_noChoice: while a command runs every choice and box is disabled", () => {
    renderSection(NOTHING_CHOSEN, undefined, true);
    for (const input of [...screen.getAllByRole("radio"), ...screen.getAllByRole("checkbox")] as HTMLInputElement[]) {
      expect(input.disabled).toBe(true);
    }
  });
});
