"use client";

import { useTranslations } from "next-intl";

import { previewSections } from "../../lib/checklist/preview-model";

import { useChecklistPage } from "./checklist-context";
import { AmenitiesPanel } from "./amenities-panel";
import { ChecklistSections } from "./checklist-sections";
import { ConditionPanel } from "./condition-panel";
import { DimensionsPanel } from "./dimensions-panel";
import { EvidencePlaceholder } from "./evidence-placeholder";
import { GroupNav } from "./group-nav";
import { IdentificationPanel } from "./identification-panel";
import { PartsPanel } from "./parts-panel";
import { SafetyPanel } from "./safety-panel";
import { TermsPanel } from "./terms-panel";

/**
 * The Edit tab (survey-checklist spec 6.2): the group navigation and one panel per group G1..G8. A viewer who cannot
 * edit sees the groups read-only, without inputs (W16-32).
 */
export function ChecklistEdit() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  if (view.editable !== true) {
    return (
      <div className="space-y-4">
        <GroupNav idPrefix="ro" />
        <ChecklistSections sections={previewSections(view.groups ?? {}, view, t)} idPrefix="ro" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <GroupNav idPrefix="cl-group" />
      <EditPanels />
    </div>
  );
}

/** The editable panels in the order G1..G8. */
function EditPanels() {
  return (
    <>
      <IdentificationPanel />
      <PartsPanel />
      <DimensionsPanel />
      <ConditionPanel />
      <SafetyPanel />
      <AmenitiesPanel />
      <EvidencePlaceholder />
      <TermsPanel />
    </>
  );
}
