import type { LeadUiError } from "./lead-ui-error";

/**
 * What the detail page does with a failed `GET` of the lead (spec 5.2):
 * - `leave-to-list`: 404, back to the list with the one-shot notice (C-37, BR-4);
 * - `forbidden`: 403, the forbidden notice in place, no lead data (E-2, CR-9);
 * - `session`: signed-out or unavailable, which `RequireSession` answers (the page keeps what it has and the drafts);
 * - `problem`: anything else, the load message with a retry (E-8).
 */
export type DetailFailureAction = "leave-to-list" | "forbidden" | "session" | "problem";

export function detailFailureAction(error: LeadUiError): DetailFailureAction {
  switch (error.kind) {
    case "not-found":
      return "leave-to-list";
    case "forbidden":
      return "forbidden";
    case "signed-out":
    case "unavailable":
      return "session";
    default:
      return "problem";
  }
}
