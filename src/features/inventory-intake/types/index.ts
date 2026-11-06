import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Inventory intake (property-create intake spec 7). The generated types as they are: a field the contract leaves
// optional may still be absent.

/** The intake of a lead as one viewer reads it; `status` and `version` are null while no current row exists. */
export type IntakeBlock = Schemas["IntakeBlockView"];
export type IntakeStatus = NonNullable<IntakeBlock["status"]>;
export type IntakeOwnerState = NonNullable<IntakeBlock["ownerState"]>;
export type IntakeOwnerCheck = NonNullable<IntakeBlock["ownerCheck"]>;
export type IntakeCaseState = NonNullable<IntakeBlock["caseState"]>;
export type IntakeSource = Schemas["IntakeBlockSource"];
export type IntakeSpace = Schemas["IntakeBlockSpace"];
export type IntakeTerm = Schemas["IntakeBlockTerm"];
export type IntakeTermValue = Schemas["IntakeTermValue"];
export type IntakeAvailabilityRow = Schemas["IntakeBlockAvailability"];
export type IntakeSuspension = Schemas["IntakeBlockSuspension"];

export type IntakeGate = Schemas["IntakeGate"];
export type GateReason = NonNullable<IntakeGate["reasons"]>[number];

export type IntakeReadiness = Schemas["IntakeReadiness"];
export type ReadinessState = NonNullable<IntakeReadiness["state"]>;
export type ReadinessReason = NonNullable<IntakeReadiness["reasons"]>[number];
export type MissingForBrokerage = NonNullable<IntakeReadiness["missingForBrokerage"]>[number];
export type IntakeReadinessUnit = Schemas["IntakeReadinessUnit"];
export type UnitReason = NonNullable<IntakeReadinessUnit["reasons"]>[number];

export type SelectionInput = Schemas["SelectionRequest"];
export type OwnerRequestInput = Schemas["OwnerRequestAsk"];
export type OwnerRequestIssued = Schemas["OwnerRequestIssued"];
export type IntakeTargetInput = Schemas["IntakeTargetRequest"];
export type IntakeMapping = Schemas["IntakeMappingRequest"];
export type IntakeAvailabilityInput = Schemas["IntakeAvailabilityRequest"];
export type IntakeAvailabilityItem = Schemas["IntakeAvailabilityItemRequest"];
export type AvailabilityState = IntakeAvailabilityItem["state"];
export type IntakeCompletionInput = Schemas["IntakeCompletionRequest"];
export type IntakeCompletionResult = Schemas["IntakeCompletionResult"];
export type IntakeRestorationInput = Schemas["IntakeRestorationRequest"];

export type InventorySearchPage = Schemas["InventorySearchPage"];
export type InventorySearchItem = Schemas["InventorySearchItem"];
export type InventorySearchUnit = Schemas["InventorySearchUnit"];
/** Either a property code, or a ward code with free text. */
export type InventorySearchQuery = { propertyCode?: string; wardCode?: string; q?: string; page?: number };

export type IntakePreview = Schemas["IntakePreviewView"];
export type IntakePreviewUnit = Schemas["IntakePreviewUnit"];
export type IntakePreviewTerm = Schemas["IntakePreviewTerm"];
export type NotCarried = NonNullable<IntakePreview["notCarried"]>[number];
export type PreviewWarning = NonNullable<IntakePreview["warnings"]>[number];
export type UnitAvailability = NonNullable<IntakePreviewUnit["availability"]>;

export type OwnerCheckContext = Schemas["OwnerCheckContext"];
export type OwnerCheckSignals = Schemas["OwnerCheckSignals"];
export type OwnerCheckInput = Schemas["OwnerCheckRequest"];
export type OwnerCheckStarted = Schemas["OwnerCheckStarted"];
export type IntakeSuspensionInput = Schemas["IntakeSuspensionRequest"];
export type IntakeReleaseInput = Schemas["IntakeReleaseRequest"];

export type InventoryCasePage = Schemas["InventoryCasePage"];
export type InventoryCaseItem = Schemas["InventoryCaseItem"];
export type InventoryCase = Schemas["InventoryCaseView"];
export type CaseSignal = NonNullable<InventoryCase["signal"]>;
export type CaseStatus = NonNullable<InventoryCase["status"]>;
export type CaseOutcome = NonNullable<InventoryCase["outcome"]>;
export type CaseDecisionInput = Schemas["CaseDecisionRequest"];

export type OwnerConfirmationList = Schemas["OwnerConfirmationList"];
export type OwnerConfirmationItem = Schemas["OwnerConfirmationItem"];
export type OwnerConfirmationDetails = Schemas["OwnerConfirmationDetails"];
export type OwnerConfirmationSnapshot = Schemas["OwnerRequestSnapshot"];
export type OwnerConfirmInput = Schemas["OwnerConfirmationConfirmRequest"];

export type AssetType = NonNullable<IntakeSource["assetType"]>;
export type RentalScope = NonNullable<IntakeSource["rentalScope"]>;
