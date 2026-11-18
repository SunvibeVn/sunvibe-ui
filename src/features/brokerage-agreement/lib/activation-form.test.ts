import { describe, expect, it } from "vitest";

import { type ActivationValues, activationBody, activationErrors, EMPTY_ACTIVATION_VALUES } from "./activation-form";

const VALUES: ActivationValues = {
  documentNumber: "HDMG-2026/014",
  signedOn: "2026-11-16",
  sunvibeSignatoryName: "Nguyen Van A",
  sunvibeSignatoryTitle: "Director",
  statementTicked: true,
};

const TARGET = { versionNo: 2, statementVersion: "brokerage-activation-2026-11", dataVersion: 7 };

describe("activation form (brokerage-agreement E05-S6, S6-D3, E05S6-P9)", () => {
  it("activationErrors_requiredAndLengthsAfterTrimming: each text is required and bounded after trimming, the date required; no date window or character rule in the browser", () => {
    expect(activationErrors(VALUES)).toEqual({});
    expect(activationErrors(EMPTY_ACTIVATION_VALUES)).toEqual({
      documentNumber: "activation.errors.documentNumber",
      signedOn: "activation.errors.signedOn",
      sunvibeSignatoryName: "activation.errors.signatoryName",
      sunvibeSignatoryTitle: "activation.errors.signatoryTitle",
    });
    expect(
      activationErrors({ ...VALUES, documentNumber: "   ", signedOn: " ", sunvibeSignatoryName: "\t", sunvibeSignatoryTitle: "  " }),
    ).toEqual({
      documentNumber: "activation.errors.documentNumber",
      signedOn: "activation.errors.signedOn",
      sunvibeSignatoryName: "activation.errors.signatoryName",
      sunvibeSignatoryTitle: "activation.errors.signatoryTitle",
    });

    expect(activationErrors({ ...VALUES, documentNumber: "x".repeat(50) })).toEqual({});
    expect(activationErrors({ ...VALUES, documentNumber: "x".repeat(51) })).toEqual({ documentNumber: "activation.errors.documentNumber" });
    expect(activationErrors({ ...VALUES, sunvibeSignatoryName: "n".repeat(100), sunvibeSignatoryTitle: "t".repeat(100) })).toEqual({});
    expect(activationErrors({ ...VALUES, sunvibeSignatoryName: "n".repeat(101), sunvibeSignatoryTitle: "t".repeat(101) })).toEqual({
      sunvibeSignatoryName: "activation.errors.signatoryName",
      sunvibeSignatoryTitle: "activation.errors.signatoryTitle",
    });

    // The server holds the date window and the character rule: a date of 1999 and a control character pass here.
    expect(activationErrors({ ...VALUES, signedOn: "1999-12-31", documentNumber: "A\u0007B" })).toEqual({});
  });

  it("activationBody_statementVersionDataVersionAndValues: the request holds the data version, the version, the statement version and the four values, the date as typed", () => {
    expect(activationBody(VALUES, TARGET)).toEqual({
      expectedDataVersion: 7,
      versionNo: 2,
      statementVersion: "brokerage-activation-2026-11",
      documentNumber: "HDMG-2026/014",
      signedOn: "2026-11-16",
      sunvibeSignatoryName: "Nguyen Van A",
      sunvibeSignatoryTitle: "Director",
    });
  });

  it("activationBody_notTicked_none: without the statement ticked, or with an error, there is no request", () => {
    expect(activationBody({ ...VALUES, statementTicked: false }, TARGET)).toBeNull();
    expect(activationBody({ ...VALUES, documentNumber: "" }, TARGET)).toBeNull();
    expect(activationBody({ ...VALUES, statementTicked: false, signedOn: "" }, TARGET)).toBeNull();
    expect(activationBody({ ...EMPTY_ACTIVATION_VALUES, statementTicked: true }, TARGET)).toBeNull();
  });

  it("activationBody_paddedValues_sentTrimmed: a value within its bound after trimming but past it with its spaces is accepted and sent trimmed", () => {
    const number = "N".repeat(50);
    const name = "A".repeat(100);
    const title = "T".repeat(100);
    const padded: ActivationValues = {
      ...VALUES,
      documentNumber: `  ${number}  `,
      sunvibeSignatoryName: `  ${name}  `,
      sunvibeSignatoryTitle: `  ${title}  `,
    };

    expect(activationErrors(padded)).toEqual({});
    expect(activationBody(padded, TARGET)).toMatchObject({
      documentNumber: number,
      sunvibeSignatoryName: name,
      sunvibeSignatoryTitle: title,
    });
  });
});
