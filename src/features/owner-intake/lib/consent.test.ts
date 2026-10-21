import { describe, expect, it } from "vitest";

import { CONSENT_NOTICE_VERSION, consentDescribedBy, consentNoticeId } from "./consent";
import { fieldElementId } from "./field-errors";

describe("consent block", () => {
  it("keeps the BR-9 notice version", () => {
    expect(CONSENT_NOTICE_VERSION).toBe("owner-intake-2026-10-21");
  });

  it("ties the notice to the checkbox id used by focus-first-invalid", () => {
    expect(consentNoticeId).toBe(`${fieldElementId("consent.accepted")}-notice`);
  });

  it("describes the checkbox by the notice, plus the error when there is one", () => {
    expect(consentDescribedBy(false)).toBe("consent-accepted-notice");
    expect(consentDescribedBy(true)).toBe("consent-accepted-notice consent-accepted-error");
  });
});
