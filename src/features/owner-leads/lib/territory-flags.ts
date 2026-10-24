import type { EligibleAssignee, Territory } from "../types";

import type { LeadUiError } from "./lead-ui-error";

/** User id of the person who looks after the ward; undefined when nobody does. */
export function holderId(territory: Territory): string | undefined {
  return territory.userId === null || territory.userId === "" ? undefined : territory.userId;
}

/** How a ward's holder stands against the people who can take leads now. */
export type HolderFlag = "none" | "ok" | "ineligible";

/**
 * C-40: `none` = nobody looks after the ward; `ok` = the holder is in the eligible list; `ineligible` = the holder
 * can no longer take leads (role or account changed), so new leads of the ward go to the unassigned queue.
 * Call it only with a list that loaded; against a list that failed, flagging everybody would be false.
 */
export function holderFlag(territory: Territory, eligible: readonly EligibleAssignee[]): HolderFlag {
  const holder = holderId(territory);
  if (holder === undefined) return "none";
  return eligible.some((person) => person.userId === holder) ? "ok" : "ineligible";
}

export type TerritoryAssignStep =
  | { kind: "invalid" }
  /** The picked person already holds the ward: no call (the API would change nothing). */
  | { kind: "unchanged" }
  | { kind: "send"; userId: string };

/** Checks the assign / change dialog (US-8 AC-2): a person is required and the current holder sends nothing. */
export function prepareTerritoryAssign(selected: string, currentUserId: string | undefined): TerritoryAssignStep {
  if (selected === "") return { kind: "invalid" };
  if (selected === currentUserId) return { kind: "unchanged" };
  return { kind: "send", userId: selected };
}

export type TerritoryProblemKind = "ineligible" | "field" | "bad-request" | "forbidden" | "generic";

/** What the territories page shows for a failed change or removal. */
export type TerritoryProblem = { kind: TerritoryProblemKind; correlationId?: string };

/**
 * Maps a `toLeadUiError` result of a territory call (spec 5.2): 422 -> `ineligible` (message, the picker reloads);
 * 400 with field `userId` -> `field` (message at the select); other 400 -> `bad-request`; 403 -> `forbidden`; every
 * other case -> `generic`. The field message is Vietnamese text of the UI, never the server text.
 */
export function territoryProblem(error: LeadUiError): TerritoryProblem {
  const withCode = (kind: TerritoryProblemKind): TerritoryProblem =>
    error.correlationId === undefined ? { kind } : { kind, correlationId: error.correlationId };
  switch (error.kind) {
    case "ineligible":
      return withCode("ineligible");
    case "validation":
      return withCode(
        error.fieldErrors !== undefined && Object.hasOwn(error.fieldErrors, "userId") ? "field" : "bad-request",
      );
    case "forbidden":
      return withCode("forbidden");
    default:
      return withCode("generic");
  }
}
