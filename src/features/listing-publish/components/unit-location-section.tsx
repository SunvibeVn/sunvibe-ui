"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import type { ListingKey } from "../lib/revision-text";
import { openListingUnitLocation } from "../services/review-api";
import type { ListingUnitLocation } from "../types";

/** The location's answer: shown, refused with its sentence, or nothing for a session answer (E06S1-P8). */
type LocationState = { kind: "idle" } | { kind: "opening" } | { kind: "shown"; location: ListingUnitLocation } | { kind: "refused"; sentence: ListingKey };

function refusalOf(result: ApiResult<ListingUnitLocation>): ListingKey | null {
  if (result.ok) return null;
  if (result.kind === "signed-out" || result.kind === "unavailable") return null;
  if (result.kind === "http" && result.status === 403) return "review.location.forbidden";
  if (result.kind === "http" && result.code === "REVISION_NOT_PENDING") return "review.location.notPending";
  if (result.kind === "http" && result.code === "LISTING_ARCHIVED") return "review.location.archived";
  return "review.location.failed";
}

/**
 * "Show the real location" (listing-publish US-4 AC-2, spec section 6, E06S4-D12): one POST per click, held while it
 * runs; the server logs each opening and answers only a reviewer who may decide the revision now. The answer is kept in
 * this component's state only: never in storage, the address or a log, and gone when the section unmounts.
 */
export function UnitLocationSection({ listingId, revisionNo }: { listingId: string; revisionNo: number }) {
  const t = useTranslations("ListingPublish");
  const [state, setState] = useState<LocationState>({ kind: "idle" });
  const sending = useRef(false);

  const open = () => {
    if (sending.current) return;
    sending.current = true;
    setState({ kind: "opening" });
    void openListingUnitLocation(listingId, revisionNo).then((result) => {
      sending.current = false;
      if (result.ok) {
        setState({ kind: "shown", location: result.data });
        return;
      }
      const sentence = refusalOf(result);
      setState(sentence === null ? { kind: "idle" } : { kind: "refused", sentence });
    });
  };

  if (state.kind === "shown") {
    const value = (text: string | null) => text ?? t("review.location.notGiven");
    const { location } = state;
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{t("review.location.unitCode")}</dt>
          <dd className="break-words text-slate-900">{value(location.unitCode)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("review.location.label")}</dt>
          <dd className="break-words text-slate-900">{value(location.locationLabel)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("review.location.street")}</dt>
          <dd className="break-words text-slate-900">{value(location.street)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("review.location.ward")}</dt>
          <dd className="break-words text-slate-900">{value(location.wardName)}</dd>
        </div>
      </dl>
    );
  }

  const opening = state.kind === "opening";
  return (
    <div className="space-y-2">
      <Button variant="secondary" className="px-4 py-2" pending={opening} disabled={opening} onClick={open}>
        {opening ? t("review.location.opening") : t("review.location.show")}
      </Button>
      {state.kind === "refused" && (
        <Alert tone="error">
          <p>{t(state.sentence)}</p>
        </Alert>
      )}
    </div>
  );
}
