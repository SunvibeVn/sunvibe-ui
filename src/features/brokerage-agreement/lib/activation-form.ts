import type { BrokerageAgreementActivationRequest } from "../types";

import type { EligibilityKey } from "./reason-text";

/**
 * The activation form without JSX (brokerage-agreement E05-S6, S6-D3): the signed document's number, the date it was
 * signed (`yyyy-MM-dd` as the date input gives it), Sunvibe's signatory's name and title, and the statement box. The
 * values are private (BR-17): they live in the form and the one request only.
 */
export type ActivationValues = {
  documentNumber: string;
  signedOn: string;
  sunvibeSignatoryName: string;
  sunvibeSignatoryTitle: string;
  statementTicked: boolean;
};

export const EMPTY_ACTIVATION_VALUES: ActivationValues = {
  documentNumber: "",
  signedOn: "",
  sunvibeSignatoryName: "",
  sunvibeSignatoryTitle: "",
  statementTicked: false,
};

/** The fields of the form, named as the request names them, so an entry of a server 400 maps to its field. */
export type ActivationField = "documentNumber" | "signedOn" | "sunvibeSignatoryName" | "sunvibeSignatoryTitle";

/** The server's bounds after trimming (S6-D3): the browser holds them so a value it accepts is not refused for length. */
export const DOCUMENT_NUMBER_MAX = 50;
export const SIGNATORY_MAX = 100;

const TEXT_FIELDS = [
  { field: "documentNumber", max: DOCUMENT_NUMBER_MAX, error: "activation.errors.documentNumber" },
  { field: "sunvibeSignatoryName", max: SIGNATORY_MAX, error: "activation.errors.signatoryName" },
  { field: "sunvibeSignatoryTitle", max: SIGNATORY_MAX, error: "activation.errors.signatoryTitle" },
] as const satisfies readonly { field: ActivationField; max: number; error: EligibilityKey }[];

/**
 * The browser's checks (E05S6-P9 (c)): each text required and within its bound after trimming, the date required. The
 * date window and the character rule are the server's (the page compares no clock, S6-D22): its 400 shows their texts.
 */
export function activationErrors(values: ActivationValues): Partial<Record<ActivationField, EligibilityKey>> {
  const errors: Partial<Record<ActivationField, EligibilityKey>> = {};
  for (const { field, max, error } of TEXT_FIELDS) {
    const length = values[field].trim().length;
    if (length === 0 || length > max) errors[field] = error;
  }
  if (values.signedOn.trim() === "") errors.signedOn = "activation.errors.signedOn";
  return errors;
}

/**
 * The one request of an activation (brokerage-agreement US-3 AC-1, AC-2, S6-D1): the data version and the statement
 * version the page read, the version's number and the four values, each text trimmed (E05S6-P9 (d): the server bounds a
 * text before it trims it); null while the statement is not ticked or a check fails.
 */
export function activationBody(
  values: ActivationValues,
  target: { versionNo: number; statementVersion: string; dataVersion: number },
): BrokerageAgreementActivationRequest | null {
  if (!values.statementTicked || Object.keys(activationErrors(values)).length > 0) return null;
  return {
    expectedDataVersion: target.dataVersion,
    versionNo: target.versionNo,
    statementVersion: target.statementVersion,
    documentNumber: values.documentNumber.trim(),
    signedOn: values.signedOn,
    sunvibeSignatoryName: values.sunvibeSignatoryName.trim(),
    sunvibeSignatoryTitle: values.sunvibeSignatoryTitle.trim(),
  };
}
