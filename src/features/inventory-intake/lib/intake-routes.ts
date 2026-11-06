/** The lead detail of a lead. */
export function leadRoute(leadId: string): string {
  return `/workspace/owner-leads/${encodeURIComponent(leadId)}`;
}

/** The intake page of a lead; the path holds the lead id only. */
export function intakeRoute(leadId: string): string {
  return `${leadRoute(leadId)}/inventory-intake`;
}

export const CASES_PATH = "/workspace/inventory-cases";

export function caseRoute(caseId: string): string {
  return `${CASES_PATH}/${encodeURIComponent(caseId)}`;
}

export const CONFIRMATIONS_PATH = "/account/property-confirmations";
