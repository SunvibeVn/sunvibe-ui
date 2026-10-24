// Test data for the checklist page logic: a visit performed by A, staff B and C, and builders of stored content as a
// read returns it. Imported by tests only.
import type { ChecklistContent, ChecklistUnitMeta, ChecklistView, ChecklistVisit } from "@/features/surveys";

export const A = "01JE2EUSERA0000000000000AA";
export const B = "01JE2EUSERB0000000000000BB";
export const C = "01JE2EUSERC0000000000000CC";
export const P1 = "01JE2ESPACE000000000000P01";
export const P2 = "01JE2ESPACE000000000000P02";

export const VISIT: ChecklistVisit = {
  appointmentId: "01JE2ESVAPPT00000000000013",
  appointmentNo: 1,
  arrivedAt: "2026-10-23T02:00:00Z",
  performedByUserId: A,
  performedByName: "Anh Sale",
  recordKind: "OWN",
  recordedByUserId: A,
  recordedByName: "Anh Sale",
  recordedAt: "2026-10-23T03:00:00Z",
  intent: "LONG_TERM_RENT",
  intentCycle: 1,
  kind: "FIRST",
};

/** Metadata of a unit A saw on site at the visit and entered. */
export function siteMeta(overrides: Partial<ChecklistUnitMeta> = {}): ChecklistUnitMeta {
  return {
    enteredByUserId: A,
    enteredByName: "Anh Sale",
    enteredAt: "2026-10-23T04:00:00Z",
    observedByUserId: A,
    observedByName: "Anh Sale",
    observedOn: "2026-10-23",
    formField: null,
    lastSource: "OBSERVED_ON_SITE",
    correctionSaveId: null,
    ...overrides,
  };
}

/** Metadata of an owner statement heard by `receiver` on `on`, entered by `enteredBy`. */
export function ownerMeta(receiver: string, on: string, enteredBy = A): ChecklistUnitMeta {
  const name = (id: string) => (id === A ? "Anh Sale" : id === B ? "Binh Leader" : "Chi Manager");
  return siteMeta({
    observedByUserId: receiver,
    observedByName: name(receiver),
    observedOn: on,
    lastSource: "OWNER_STATED",
    enteredByUserId: enteredBy,
    enteredByName: name(enteredBy),
  });
}

export const plain = (state: "UNKNOWN" | "VALUE" | "NOT_APPLICABLE" = "UNKNOWN", value: unknown = null) => ({
  state,
  value,
  naReason: null,
});

export const sourced = (
  state: "UNKNOWN" | "VALUE" | "NOT_APPLICABLE" = "UNKNOWN",
  value: unknown = null,
  source: string | null = null,
  extra: { confirmedOn?: string | null; receivedByUserId?: string | null; relayBasis?: string | null } = {},
) => ({
  state,
  value,
  naReason: null,
  source,
  confirmedOn: extra.confirmedOn ?? null,
  receivedByUserId: extra.receivedByUserId ?? null,
  relayBasis: extra.relayBasis ?? null,
});

/** An empty stored content of every group, PARTS with spaces P1 and P2 (as a read returns it). */
export function emptyContent(scope: "WHOLE" | "PARTS" | null = "PARTS"): ChecklistContent {
  const spaces = scope === null ? [] : scope === "WHOLE" ? [P1] : [P1, P2];
  const parts = scope === "PARTS";
  return {
    identification: {
      observedAddress: sourced() as never,
      differenceNote: null,
      propertyType: plain() as never,
      fit: plain() as never,
      rentalScope: scope,
      spaces: spaces.map((spaceId, index) => ({
        spaceId,
        code: `P${index + 1}`,
        location: `Floor ${index + 1}`,
        description: null,
        meta: siteMeta(),
      })),
      otherPartsNote: null,
      generalNote: null,
      difference: { fromLead: false, fromMeetingPlace: false },
      provinceName: null,
      wardName: null,
      fieldMeta: { differenceNote: null, otherPartsNote: null, generalNote: null, rentalScope: siteMeta() },
    },
    parts: {
      accessRoute: plain() as never,
      sharedAreas: plain() as never,
      totalFloors: sourced() as never,
      spaces: spaces.map((spaceId) => ({
        spaceId,
        floor: plain() as never,
        privateAreas: plain() as never,
        actualAccess: plain() as never,
      })),
    },
    dimensions: {
      spaces: spaces.map((spaceId) => ({
        spaceId,
        area: sourced() as never,
        bedrooms: sourced() as never,
        privateBathrooms: sourced() as never,
        sharedBathroomUse: sourced() as never,
        layoutNote: null,
        fieldMeta: { layoutNote: null },
      })),
    },
    condition: {
      sharedKitchen: parts ? (plain() as never) : null,
      sharedBathroom: parts ? (plain() as never) : null,
      spaces: spaces.map((spaceId) => ({
        spaceId,
        occupancy: plain() as never,
        expectedVacantFrom: sourced() as never,
        availableFrom: sourced() as never,
        mainSpace: plain() as never,
        kitchen: plain() as never,
        bathroom: plain() as never,
      })),
    },
    safety: { egress: plain() as never, accessRestrictions: plain() as never, hazards: plain() as never },
    amenities: {
      sharedItems: [],
      spaces: spaces.map((spaceId) => ({ spaceId, furnishing: sourced() as never, items: [] })),
      otherItems: [],
    },
    terms: {
      common: {
        electricity: sourced() as never,
        water: sourced() as never,
        internet: sourced() as never,
        parking: sourced() as never,
        serviceFee: sourced() as never,
        otherFees: sourced() as never,
        houseRules: sourced() as never,
        pets: sourced() as never,
        handoverMaintenance: sourced() as never,
      },
      spaces: spaces.map((spaceId) => ({
        spaceId,
        monthlyRent: sourced() as never,
        deposit: sourced() as never,
        paymentPeriodMonths: sourced() as never,
        minimumTermMonths: sourced() as never,
        chargeOverrides: parts
          ? { electricity: null, water: null, internet: null, parking: null, serviceFee: null }
          : null,
        spaceFees: null,
      })),
    },
  };
}

/** A checklist read with the given content, every group at `version`. */
export function viewOf(content: ChecklistContent, version = 1, overrides: Partial<ChecklistView> = {}): ChecklistView {
  const group = <T>(c: T) => ({ version, updatedAt: null, updatedByUserId: null, updatedByName: null, content: c });
  return {
    id: "01JE2ECHECKLIST00000000001",
    leadId: "01JE2EHEAD0000000000000013",
    lead: { requestCode: "SV-E2EA-AA2N", status: "SURVEY_SCHEDULED" },
    leadStaff: [
      { userId: A, name: "Anh Sale" },
      { userId: B, name: "Binh Leader" },
      { userId: C, name: "Chi Manager" },
    ],
    checklistNo: 1,
    status: "DRAFT",
    kind: "FULL_ASSESSMENT",
    templateCode: "LONG_TERM_RENT",
    templateVersion: 1,
    visit: VISIT,
    holderUserId: A,
    holderName: "Anh Sale",
    editable: true,
    readOnlyReason: null,
    groups: {
      identification: group(content.identification),
      parts: group(content.parts),
      dimensions: group(content.dimensions),
      condition: group(content.condition),
      safety: group(content.safety),
      amenities: group(content.amenities),
      terms: group(content.terms),
    },
    readiness: { submissionAvailable: false, missing: [], unconfirmedTerms: [], warnings: [] },
    effectiveTerms: [],
    earlierHazards: [],
    ownerForm: null,
    takeovers: [],
    corrections: [],
    editors: [],
    createdByUserId: A,
    createdAt: "2026-10-23T04:00:00Z",
    version: 1,
    updatedAt: "2026-10-23T04:00:00Z",
    ...overrides,
  };
}
