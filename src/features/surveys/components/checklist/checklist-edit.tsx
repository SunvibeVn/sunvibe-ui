"use client";

import { useTranslations } from "next-intl";

import { previewSections } from "../../lib/checklist/preview-model";

import { useChecklistPage } from "./checklist-context";
import { AmenitiesPanel } from "./amenities-panel";
import { ChecklistSections } from "./checklist-sections";
import { ConditionPanel } from "./condition-panel";
import { DimensionsPanel } from "./dimensions-panel";
import { EvidencePlaceholder } from "./evidence-placeholder";
import { useChecklistMedia } from "./media-context";
import { GroupNav } from "./group-nav";
import { IdentificationPanel } from "./identification-panel";
import { PartsPanel } from "./parts-panel";
import { PhotosPanel } from "./photos-panel";
import { SafetyPanel } from "./safety-panel";
import { SubmitPanel } from "./submit-panel";
import { TermsPanel } from "./terms-panel";

/**
 * The Edit tab (survey-checklist spec 6.2): the group navigation, one panel per group G1..G8 and the submit panel. A
 * viewer who cannot edit sees the groups read-only, without inputs (W16-32).
 */
export function ChecklistEdit() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  if (view.editable !== true) {
    return (
      <div className="space-y-4">
        <GroupNav idPrefix="ro" />
        <ChecklistSections sections={previewSections(view.groups ?? {}, view, t)} idPrefix="ro" evidence="readOnly" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <GroupNav idPrefix="cl-group" />
      <EditPanels />
      <SubmitPanel />
    </div>
  );
}

/** The editable panels in the order G1..G8; G7 is the Photos panel once photos are available (survey-media A-1). */
function EditPanels() {
  const media = useChecklistMedia();
  return (
    <>
      <IdentificationPanel />
      <PartsPanel />
      <DimensionsPanel />
      <ConditionPanel />
      <SafetyPanel />
      <AmenitiesPanel />
      {media === null ? <EvidencePlaceholder /> : <PhotosPanel />}
      <TermsPanel />
    </>
  );
}
