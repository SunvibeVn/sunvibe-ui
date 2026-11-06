import type { OwnerLeadsKey } from "@/features/lead-shared";

import type { ChecklistProblem } from "../../../surveys/schemas/checklist";
import { type FieldKind, problemText, type SurveyT } from "../survey/survey-copy";

/** The message of a checklist field problem; the server's own text is never shown (spec 6.3). */
export function checklistProblemText(t: SurveyT, problem: ChecklistProblem, kind: FieldKind = "text", max?: number): string {
  switch (problem) {
    case "codeChars":
    case "duplicate":
    case "tooMany":
    case "server":
    case "notAllowed":
      return t(`checklist.problems.${problem}` as OwnerLeadsKey);
    default:
      return problemText(t, problem, kind, max);
  }
}
