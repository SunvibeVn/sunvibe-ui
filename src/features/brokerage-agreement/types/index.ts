import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

// Brokerage agreement (brokerage-agreement E05-S1). The generated types as they are: a field the contract leaves
// optional may still be absent.

/** Whether each unit of the lead's latest completed intake can get an agreement now, and the reason groups when not. */
export type BrokerageEligibility = Schemas["BrokerageEligibility"];
export type BrokerageEligibilityUnit = Schemas["BrokerageEligibilityUnit"];
export type BasisState = NonNullable<BrokerageEligibility["basisState"]>;
export type ReasonGroup = NonNullable<BrokerageEligibilityUnit["reasonGroups"]>[number];
