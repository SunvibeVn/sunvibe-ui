import type { BrokerageAgreementAdvertising } from "../types";

import { advertisingReasonText } from "./advertising-text";
import { calendarDateText } from "./date-text";
import type { Phrase } from "./version-terms-model";

/**
 * What the advertising panel shows (brokerage-agreement US-4 AC-1, S6-D7): may Sunvibe advertise the unit now, until the
 * end of which date and with which public photos; or, when not, one line per group that stops it.
 */
export type AdvertisingModel = { allowed: true; line: Phrase; photos: Phrase } | { allowed: false; lines: Phrase[] };

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/**
 * The photo line, interior first (brokerage-agreement BR-9, BR-12, E05S6-P9 (b)): both consents, the interior only, or
 * none. An exterior consent without the interior one, which the server never sends, never shows more than the interior
 * consent the exterior builds on.
 */
function photoLine(answer: BrokerageAgreementAdvertising): Phrase {
  const interior = answer.photoConsent?.interior === true;
  const exterior = answer.photoConsent?.exterior === true;
  if (interior && exterior) return { key: "advertising.photos.interiorAndExterior" };
  if (interior) return { key: "advertising.photos.interior" };
  return { key: "advertising.photos.none" };
}

/**
 * Turns the detail's advertising answer into the panel's model (brokerage-agreement S6-D7, S6-D8). Only an answer whose
 * `allowed` is true reads as allowed; an absent `allowed` is false, and an answer that is not allowed and names no group
 * reads "Another reason stops it.", so nothing absent ever reads as allowed. The groups keep the answer's order.
 */
export function advertisingModel(answer: BrokerageAgreementAdvertising): AdvertisingModel {
  if (answer.allowed === true) {
    return {
      allowed: true,
      line: present(answer.endDate)
        ? { key: "advertising.allowed", values: { date: calendarDateText(answer.endDate) } }
        : { key: "advertising.allowedNoEnd" },
      photos: photoLine(answer),
    };
  }
  const lines = (answer.reasonGroups ?? []).map((group) => advertisingReasonText(group, answer));
  return { allowed: false, lines: lines.length === 0 ? [{ key: "eligibility.reasons.OTHER" }] : lines };
}
