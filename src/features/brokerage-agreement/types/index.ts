import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Brokerage agreement (brokerage-agreement E05-S1). The generated types as they are: a field the contract leaves
// optional may still be absent.

/** Whether each unit of the lead's latest completed intake can get an agreement now, and the reason groups when not. */
export type BrokerageEligibility = Schemas["BrokerageEligibility"];
export type BrokerageEligibilityUnit = Schemas["BrokerageEligibilityUnit"];
export type BasisState = NonNullable<BrokerageEligibility["basisState"]>;
export type ReasonGroup = NonNullable<BrokerageEligibilityUnit["reasonGroups"]>[number];

// The draft and its detail (brokerage-agreement E05-S2).

/** The draft request: the basis lead, the unit, the transaction type and the period (`yyyy-mm-dd`). */
export type BrokerageAgreementCreateRequest = Schemas["BrokerageAgreementCreateRequest"];
/** The answer of a created draft: its id only. */
export type BrokerageAgreementCreated = Schemas["BrokerageAgreementCreated"];
/** The agreement and its versions, without owner, intake, property, creator or drafter (brokerage-agreement BR-17). */
export type BrokerageAgreementDetail = Schemas["BrokerageAgreementDetail"];
export type BrokerageAgreementVersion = Schemas["BrokerageAgreementVersion"];
export type AgreementStatus = NonNullable<BrokerageAgreementDetail["status"]>;
export type VersionStatus = NonNullable<BrokerageAgreementVersion["status"]>;

// Editing the draft: its advertising permission, photo consent and confirmed terms (brokerage-agreement E05-S3).

/** The whole draft sent back with the data version the page read; a part not known yet is null (BR-5, BR-8). */
export type BrokerageAgreementDraftRequest = Schemas["BrokerageAgreementDraftRequest"];
export type BrokerageAgreementTermsInput = Schemas["BrokerageAgreementTermsInput"];
export type BrokerageAgreementFeeInput = Schemas["BrokerageAgreementFeeInput"];
/** The confirmed terms of a version (BR-8): every part null until entered; `mandatoryFees` null = not stated yet. */
export type BrokerageAgreementTerms = Schemas["BrokerageAgreementTerms"];
export type BrokerageAgreementRent = Schemas["BrokerageAgreementRent"];
export type BrokerageAgreementDeposit = Schemas["BrokerageAgreementDeposit"];
export type BrokerageAgreementFee = Schemas["BrokerageAgreementFee"];
/** The survey's values for the draft's terms, each with its source and date: a proposal, never stored (S3-D13). */
export type BrokerageAgreementSurveyTerms = Schemas["BrokerageAgreementSurveyTerms"];
export type BrokerageAgreementTermSource = Schemas["BrokerageAgreementTermSource"];
export type DepositBasis = NonNullable<BrokerageAgreementDeposit["basis"]>;
export type FeeBasis = NonNullable<BrokerageAgreementFee["basis"]>;
export type ChargeUnit = NonNullable<BrokerageAgreementFee["chargeUnit"]>;
export type TermSourceCode = NonNullable<BrokerageAgreementTermSource["source"]>;
export type AdvertisingScope = NonNullable<BrokerageAgreementVersion["advertisingScope"]>;

// The brokerage fee policy of a version, and sending the draft to the owner (brokerage-agreement E05-S4, BR-7).

/**
 * The fee policy of a version as the detail answers it (S4-D10): the payer and the moment are fixed statements; every
 * other part is null until entered. The property is optional in the contract, so an answer may leave it out.
 */
export type BrokerageAgreementFeePolicy = Schemas["BrokerageAgreementFeePolicy"];
/** How a fee is set: a percentage of one month's rent by tiers, a fixed amount, free of charge, or (renewal) no fee. */
export type BrokerageAgreementFeeFormula = Schemas["BrokerageAgreementFeeFormula"];
export type BrokerageAgreementFeeTier = Schemas["BrokerageAgreementFeeTier"];
export type BrokerageAgreementEarlyLeaseEnd = Schemas["BrokerageAgreementEarlyLeaseEnd"];
/** The fee policy part of the whole-draft PUT (S4-D1): each part null when not entered. */
export type BrokerageAgreementFeePolicyInput = Schemas["BrokerageAgreementFeePolicyInput"];
export type BrokerageAgreementFeeFormulaInput = Schemas["BrokerageAgreementFeeFormulaInput"];
export type BrokerageAgreementFeeTierInput = Schemas["BrokerageAgreementFeeTierInput"];
export type BrokerageAgreementEarlyLeaseEndInput = Schemas["BrokerageAgreementEarlyLeaseEndInput"];
/** Sending the draft: only the data version the page read (S4-D2). */
export type BrokerageAgreementDraftSubmissionRequest = Schemas["BrokerageAgreementDraftSubmissionRequest"];
export type FeeFormulaType = NonNullable<BrokerageAgreementFeeFormula["type"]>;
export type EarlyLeaseEndType = NonNullable<BrokerageAgreementEarlyLeaseEnd["type"]>;

// The owner's answer to a sent version, and a new draft after a rejection or a lapse (brokerage-agreement E05-S5).

/**
 * The account's agreements holding a sent version (S5-D1): at most 50, newest sending first; `more` when there are more.
 * An account that is not an owner gets an empty list, the same as an owner with nothing (S5-D18).
 */
export type BrokerageAgreementOwnerList = Schemas["BrokerageAgreementOwnerList"];
/** One agreement of the owner: its unit and location, its sent versions in their effective state, the statement. */
export type BrokerageAgreementOwnerItem = Schemas["BrokerageAgreementOwnerItem"];
/** The confirmation statement of the version the owner may answer now; its `version` goes back with a confirmation. */
export type BrokerageAgreementStatement = Schemas["BrokerageAgreementStatement"];
/** Confirming 1 to 20 sent versions with the current password and the statement version read (S5-D5). */
export type BrokerageAgreementConfirmationRequest = Schemas["BrokerageAgreementConfirmationRequest"];
export type BrokerageAgreementConfirmationItemInput = Schemas["BrokerageAgreementConfirmationItemInput"];
/** Declining the version waiting for the owner, with an optional private reason (S5-D7). */
export type BrokerageAgreementRejectionRequest = Schemas["BrokerageAgreementRejectionRequest"];
/** Opening the next draft version: only the data version the page read (S5-D10). */
export type BrokerageAgreementNewDraftRequest = Schemas["BrokerageAgreementNewDraftRequest"];

// Activation and the advertising answer (brokerage-agreement E05-S6).

/**
 * Whether Sunvibe may advertise the unit now, computed at each read of the detail (S6-D7, S6-D8): the reason groups when
 * not, the end date, the photo consent in force and the version that starts later. Every part may be absent.
 */
export type BrokerageAgreementAdvertising = Schemas["BrokerageAgreementAdvertising"];
/**
 * A manager's activation decision on a version (S6-D3, S6-D4, S6-D21): staff-only private values (BR-17), always null in
 * the owner's read.
 */
export type BrokerageAgreementVersionActivation = Schemas["BrokerageAgreementVersionActivation"];
/** Activating the confirmed version: the signed document's four values, the statement version and the data version. */
export type BrokerageAgreementActivationRequest = Schemas["BrokerageAgreementActivationRequest"];
/** Refusing the activation: one of two reasons, an optional note and the data version (S6-D4). */
export type BrokerageAgreementActivationRefusalRequest = Schemas["BrokerageAgreementActivationRefusalRequest"];
export type ActivationRefusalType = NonNullable<BrokerageAgreementActivationRefusalRequest["reasonType"]>;
