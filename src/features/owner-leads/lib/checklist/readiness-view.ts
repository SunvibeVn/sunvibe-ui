import { CHECKLIST_GROUP_NAME, type ChecklistGroupPath, type ChecklistView } from "@/features/surveys";

// The readiness lists of a read (survey-checklist spec 4.7) as the preview shows them: each missing item and
// unconfirmed term names its space by code and links to its field in Edit.

export type PreviewGroup = ChecklistGroupPath | "evidence";

const PATH_OF: Record<string, PreviewGroup> = {
  ...Object.fromEntries(Object.entries(CHECKLIST_GROUP_NAME).map(([path, name]) => [name, path as ChecklistGroupPath])),
  EVIDENCE: "evidence",
};

/** The element id of a field in the Edit tab: `cl-<group>-<spaceId|asset>-<field>`; G7 is `cl-evidence`. */
export function fieldAnchor(group: PreviewGroup, spaceId: string | null | undefined, field: string | null | undefined): string {
  if (group === "evidence") return "cl-evidence";
  return `cl-${group}-${spaceId ?? "asset"}-${field ?? "group"}`;
}

export type MissingLine = {
  group: PreviewGroup;
  spaceCode: string | null;
  field: string | null;
  problem: string;
  anchor: string;
};
export type UnconfirmedLine = { group: PreviewGroup; spaceCode: string | null; field: string; anchor: string };
export type WarningLine = { type: string; hazardId: string | null; spaceCode: string | null; checklistNo: number | null };

export type ReadinessModel = { missing: MissingLine[]; unconfirmed: UnconfirmedLine[]; warnings: WarningLine[] };

/** The space codes of G1 by id (a code never needs the id on screen). */
export function spaceCodes(view: ChecklistView): Map<string, string> {
  return new Map(
    (view.groups?.identification?.content?.spaces ?? []).map((space) => [space.spaceId ?? "", space.code ?? ""]),
  );
}

export function readinessView(view: ChecklistView): ReadinessModel {
  const codes = spaceCodes(view);
  const code = (spaceId: string | null | undefined) => (spaceId ? (codes.get(spaceId) ?? null) : null);
  const readiness = view.readiness;
  return {
    missing: (readiness?.missing ?? []).map((item) => {
      const group = PATH_OF[item.group ?? ""] ?? "identification";
      return {
        group,
        spaceCode: code(item.spaceId),
        field: item.field ?? null,
        problem: item.problem ?? "NOT_CHECKED",
        anchor: fieldAnchor(group, item.spaceId, item.field),
      };
    }),
    unconfirmed: (readiness?.unconfirmedTerms ?? []).map((item) => {
      const group = PATH_OF[item.group ?? ""] ?? "terms";
      return { group, spaceCode: code(item.spaceId), field: item.field ?? "", anchor: fieldAnchor(group, item.spaceId, item.field) };
    }),
    warnings: (readiness?.warnings ?? []).map((item) => ({
      type: item.type ?? "",
      hazardId: item.hazardId ?? null,
      spaceCode: code(item.spaceId),
      checklistNo: item.checklistNo ?? null,
    })),
  };
}
