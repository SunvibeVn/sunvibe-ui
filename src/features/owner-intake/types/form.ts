import type { components } from "@/api/generated/schema";

import type { FIELD_ORDER } from "../lib/field-errors";

import type { WardType } from "./catalog";

type OwnerIntakeRequest = components["schemas"]["OwnerIntakeRequest"];

export type Intent = OwnerIntakeRequest["intent"];
export type PropertyType = NonNullable<OwnerIntakeRequest["propertyType"]>;
export type PriceUnit = NonNullable<components["schemas"]["AskingPriceRequest"]["unit"]>;

/**
 * The OpenAPI file types `askingPrice.amount` as a string (int64 format), but the server wants a JSON number
 * (handoff section 6). This body type overrides that one field; send it with `amount` as a number.
 */
export type AskingPriceBody = Omit<components["schemas"]["AskingPriceRequest"], "amount"> & { amount: number };
export type OwnerIntakeRequestBody = Omit<OwnerIntakeRequest, "askingPrice"> & { askingPrice?: AskingPriceBody };

/**
 * Controlled state of the whole form, owned by the form container. Text inputs keep the raw text; empty string
 * means "not filled". Nested where the request is nested, so validation paths match server `errors[].field`.
 */
export type FormValues = {
  contactName: string;
  phone: string;
  email: string;
  intent: Intent | "";
  provinceCode: string;
  wardCode: string;
  /** Type of the chosen ward, from the catalog; a SPECIAL_ZONE ward sends no coordinates. */
  wardType?: WardType;
  /** Name of the chosen ward, from the catalog; never sent. */
  wardName?: string;
  addressDetail: string;
  latitude?: number;
  longitude?: number;
  propertyType: PropertyType | "";
  askingPrice: { amount: string };
  availableFrom: string;
  notes: string;
  preferredCallbackTime: string;
  consent: { accepted: boolean };
};

/** Message kind under OwnerIntake.errors.fields.<field>. */
export type FieldErrorKind = "required" | "invalid" | "tooLong";

/** A field path as the server reports it in `errors[].field`; FIELD_ORDER lists them in form order. */
export type FieldName = (typeof FIELD_ORDER)[number];

/** Client-side validation result: one kind per failing field. */
export type FieldErrorKinds = Partial<Record<FieldName, FieldErrorKind>>;
