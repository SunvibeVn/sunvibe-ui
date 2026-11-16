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
