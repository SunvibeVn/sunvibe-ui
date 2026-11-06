"use client";

import { useTranslations } from "next-intl";
import { type ChangeEvent, useId, useState } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { MediaCategory } from "@/features/surveys";

import { captionInput, CAPTION_MAX, categoriesFor, megabytes, remainingPlaces } from "../../lib/checklist/media-form";
import type { MediaPanelModel } from "../../lib/checklist/media-panel-model";
import type { SurveyProblem } from "../../../surveys/schemas/survey/survey-text";
import { problemText } from "../survey/survey-copy";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { useChecklistMedia } from "./media-context";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const ASSET = "asset";
const PICK =
  "relative inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50/50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet-600";

/**
 * "Add photos" (survey-media spec 6.2 Upload): placement (the asset or a space of the saved G1), a category allowed
 * there, an optional caption, then "Choose photos" (several at once) or "Take photo" (the camera). Every picked file
 * becomes its own row in the uploader; size and place counts are hints only.
 */
export function PhotoUploadForm({ model }: { model: MediaPanelModel }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const { view } = useChecklistPage();
  const ids = { placement: useId(), category: useId(), caption: useId(), hint: useId() };
  const [placement, setPlacement] = useState<string>(ASSET);
  const [category, setCategory] = useState<MediaCategory | "">("");
  const [caption, setCaption] = useState("");
  const [problem, setProblem] = useState<SurveyProblem | "category" | null>(null);

  const spaces = (view.groups?.identification?.content?.spaces ?? []).map((space) => ({ id: space.spaceId ?? "", code: space.code ?? "" }));
  const spaceId = placement === ASSET ? null : placement;
  const categories = categoriesFor([...model.required, ...model.optional], spaceId);
  const chosen = category !== "" && categories.includes(category) ? category : "";
  const remaining = remainingPlaces(model.limits);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // The same file may be picked again later (a new photo each time).
    event.target.value = "";
    if (files.length === 0 || media === null) return;
    if (chosen === "") {
      setProblem("category");
      return;
    }
    const checked = captionInput(caption);
    if (checked.problem !== null) {
      setProblem(checked.problem);
      return;
    }
    setProblem(null);
    media.addFiles(files, { spaceId, category: chosen, caption: checked.caption });
  };

  return (
    <section aria-labelledby={`${ids.placement}-title`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 id={`${ids.placement}-title`} className="text-sm font-semibold text-slate-900">
        {t("checklist.media.upload.title")}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={ids.placement} label={t("checklist.media.upload.placement")}>
          <Select
            id={ids.placement}
            compact
            value={placement}
            onChange={(event) => {
              setPlacement(event.target.value);
              setCategory("");
            }}
          >
            <option value={ASSET}>{t("checklist.media.placement.asset")}</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {t("checklist.media.placement.space", { code: space.code })}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id={ids.category}
          label={t("checklist.media.upload.category")}
          required
          error={problem === "category" ? t("checklist.media.upload.pickCategory") : undefined}
        >
          <Select
            id={ids.category}
            compact
            value={chosen}
            invalid={problem === "category"}
            aria-describedby={describedBy(ids.category, problem === "category" ? "category" : undefined)}
            onChange={(event) => {
              setCategory(event.target.value as MediaCategory | "");
              if (problem === "category") setProblem(null);
            }}
          >
            <option value="">{t("checklist.panel.choose")}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {t(`checklist.media.categories.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <SurveyTextField
        id={ids.caption}
        label={t("checklist.media.upload.caption")}
        optional
        hint={t("checklist.media.upload.captionHint")}
        value={caption}
        onChange={(next) => {
          setCaption(next);
          if (problem !== null && problem !== "category") setProblem(null);
        }}
        error={problem !== null && problem !== "category" ? problemText(t, problem, "text", CAPTION_MAX) : undefined}
      />
      <p id={ids.hint} className="text-xs text-slate-600">
        {t("checklist.media.upload.hint", { maxMb: megabytes(model.limits.maxFileBytes), remaining })}
      </p>
      <div className="flex flex-wrap gap-2">
        <label className={PICK}>
          <input type="file" multiple accept={ACCEPT} className="sr-only" aria-describedby={ids.hint} onChange={pick} />
          {t("checklist.media.upload.choose")}
        </label>
        <label className={PICK}>
          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-describedby={ids.hint} onChange={pick} />
          {t("checklist.media.upload.take")}
        </label>
      </div>
    </section>
  );
}
