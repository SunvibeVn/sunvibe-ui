import { formatDateTime } from "../lib/format";
import { intentLabelKey, type OwnerLeadsKey, propertyTypeLabelKey } from "../lib/labels";
import type { LeadSummary } from "../types";

/**
 * One list row, shared by the table and the cards: the ten fields of C-46 (ACTION opens `id`). Never holds phone,
 * email, address, next action or assignee (lead-queue BR-7, C-47). Labels are message keys; times are already
 * `dd/MM/yyyy HH:mm` in Vietnam time (C-51).
 */
export type LeadRow = {
  /** Detail id; undefined when the API sent none (no "View" link then). */
  id: string | undefined;
  code: string;
  owner: string;
  ward: string;
  /** Intent label key; null for none or an unknown value (the cell stays empty). */
  requirementKey: OwnerLeadsKey | null;
  /** Property type label key; null for none or an unknown value (W13). */
  propertyTypeKey: OwnerLeadsKey | null;
  status: string | undefined;
  /** `createdAt`. */
  created: string;
  /** `lastActivityAt`: the latest entry of the lead's history (C-49). */
  lastUpdate: string;
  possibleDuplicate: boolean;
};

function time(iso: string | undefined): string {
  return iso === undefined ? "" : formatDateTime(iso);
}

export function toLeadRow(lead: LeadSummary): LeadRow {
  return {
    id: lead.id,
    code: lead.requestCode ?? "",
    owner: lead.contactName ?? "",
    ward: lead.wardName ?? "",
    requirementKey: intentLabelKey(lead.intent),
    propertyTypeKey: propertyTypeLabelKey(lead.propertyType),
    status: lead.status,
    created: time(lead.createdAt),
    lastUpdate: time(lead.lastActivityAt),
    possibleDuplicate: lead.possibleDuplicate === true,
  };
}
