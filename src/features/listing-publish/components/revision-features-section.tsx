"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import {
  FEATURE_NAMES,
  type FeatureName,
  featureLabelKey,
  isOptionFeature,
  OPTION_CODES,
  type OptionFeature,
  optionLabelKey,
} from "../lib/revision-text";
import type { ListingFeatures } from "../types";

type FeaturesProps = { values: ListingFeatures; onChange: (next: ListingFeatures) => void; disabled: boolean };

const CHOICE_CLASS = "h-4 w-4 shrink-0 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** One option feature: its options and "Not stated" (null), as one group of choices named by the feature. */
function OptionChoice({ name, values, onChange, disabled }: FeaturesProps & { name: OptionFeature }) {
  const t = useTranslations("ListingPublish");
  const group = useId();
  const choose = (code: string | null) => onChange({ ...values, [name]: code });
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-sm font-medium text-slate-700">{t(featureLabelKey(name))}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[...OPTION_CODES[name], null].map((code) => (
          <label key={code ?? "none"} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name={group}
              checked={values[name] === code}
              disabled={disabled}
              onChange={() => choose(code)}
              className={CHOICE_CLASS}
            />
            {t(optionLabelKey(code))}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One yes-feature: a box that says it is there. */
function YesBox({ name, values, onChange, disabled }: FeaturesProps & { name: Exclude<FeatureName, OptionFeature> }) {
  const t = useTranslations("ListingPublish");
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={values[name]}
        disabled={disabled}
        onChange={(event) => onChange({ ...values, [name]: event.target.checked })}
        className={CHOICE_CLASS}
      />
      {t(featureLabelKey(name))}
    </label>
  );
}

/**
 * The thirteen features of a Draft (listing-publish US-2 AC-1, listing BR-3, E06S2-D5): a group of choices per option
 * feature with "Not stated", a box per yes-feature. Every label is English (E06S2-D17, G2 D-48); the Vietnamese words
 * are the public page's (E07). Controlled: each change answers the whole features.
 */
export function RevisionFeaturesSection({ values, onChange, disabled }: FeaturesProps) {
  const t = useTranslations("ListingPublish");
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold text-slate-900">{t("revision.features.heading")}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURE_NAMES.map((name) =>
          isOptionFeature(name) ? (
            <OptionChoice key={name} name={name} values={values} onChange={onChange} disabled={disabled} />
          ) : (
            <YesBox key={name} name={name} values={values} onChange={onChange} disabled={disabled} />
          ),
        )}
      </div>
    </fieldset>
  );
}
