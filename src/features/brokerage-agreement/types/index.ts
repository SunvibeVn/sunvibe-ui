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
