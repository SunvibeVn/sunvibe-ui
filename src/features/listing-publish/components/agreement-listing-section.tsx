"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { type AgreementListingModel, agreementListingModel, type ListingLine } from "../lib/agreement-listing-model";
import { type ListingCreateSentence, runListingCreate } from "../lib/listing-create-flow";
import { listingPath } from "../lib/listing-model";
import { createListing, getAgreementListings } from "../services/listing-api";

const LOADING: AgreementListingModel = { kind: "loading" };

/** One listing of the agreement: "Listing {code}", its state and "Open" to its page. */
function ListingRow({ line }: { line: ListingLine }) {
  const t = useTranslations("ListingPublish");
  const codeId = useId();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
      <span id={codeId} className="break-words text-sm font-medium text-slate-900">
        {t("section.listing", { code: line.code })}
      </span>
      <Badge>{t(line.stateKey)}</Badge>
      <Link
        href={listingPath(line.listingId)}
        prefetch={false}
        aria-describedby={codeId}
        className="text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        {t("section.open")}
      </Link>
    </li>
  );
}

/**
 * "Listing" on the agreement page (listing-publish US-1 AC-1 to AC-3, spec section 6, E06S1-D12): the agreement's open
 * listing, or whether the caller may create one now and, when not, why; its archived listings in every case. The page
 * places it below "Advertising" and mounts it again with every read of the agreement, so it reads on mount, on "Try
 * again" and after a create that did not land. "Create a listing" sends one request: disabled with "Creating…" while it
 * runs, a click meanwhile sends nothing; a created listing opens its page. A refusal's sentence stays above what the
 * read after it shows, and takes the focus (E06S1-P8). The creation part of the answer is a hint: the server decides.
 */
export function AgreementListingSection({ agreementId }: { agreementId: string }) {
  const t = useTranslations("ListingPublish");
  const router = useRouter();
  const titleId = useId();
  const [model, setModel] = useState<AgreementListingModel>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [sentence, setSentence] = useState<ListingCreateSentence | null>(null);
  const [creating, setCreating] = useState(false);
  /** Set when a create starts, cleared when it ends without a listing: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const sentenceRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let dropped = false;
    void getAgreementListings(agreementId).then((result) => {
      if (!dropped) setModel(agreementListingModel(result));
    });
    return () => {
      dropped = true;
    };
  }, [agreementId, attempt]);

  useEffect(() => {
    if (sentence !== null) sentenceRef.current?.focus();
  }, [sentence]);

  const reread = () => {
    setModel(LOADING);
    setAttempt((count) => count + 1);
  };

  const create = async () => {
    if (sending.current) return;
    sending.current = true;
    setCreating(true);
    setSentence(null);
    let created = false;
    try {
      const outcome = await runListingCreate(agreementId, {
        create: (id) => createListing(id),
        goTo: (path) => router.push(path),
        reread,
      });
      if (outcome.kind === "created") created = true;
      else setSentence(outcome.sentence);
    } finally {
      // A created listing keeps the button disabled while the browser moves to its page.
      if (!created) {
        sending.current = false;
        setCreating(false);
      }
    }
  };

  if (model.kind === "hidden" && sentence === null) return null;

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={titleId} className="text-base font-semibold text-slate-900">
        {t("section.title")}
      </h2>
      {sentence !== null && (
        <p
          ref={sentenceRef}
          role="status"
          tabIndex={-1}
          className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          {t(sentence)}
        </p>
      )}
      {model.kind === "loading" && (
        <p role="status" className="text-sm text-slate-500">
          {t("section.loading")}
        </p>
      )}
      {model.kind === "error" && (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("section.loadFailed")}</p>
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={reread}>
            {t("section.retry")}
          </Button>
        </div>
      )}
      {model.kind === "ready" && (
        <div className="space-y-3">
          {model.emptyLine !== null && <p className="text-sm text-slate-700">{t(model.emptyLine)}</p>}
          {model.offer !== null && (
            <div className="space-y-2">
              {model.offer.notStarted && <p className="text-sm text-slate-700">{t("section.notStarted")}</p>}
              <Button className="px-4 py-2" pending={creating} onClick={() => void create()}>
                {creating ? t("section.creating") : t("section.create")}
              </Button>
            </div>
          )}
          {model.refusals.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900">{t("section.notAllowed")}</p>
              {model.refusals.map((key, index) => (
                <p key={`${index}:${key}`} className="break-words text-slate-700">
                  {t(key)}
                </p>
              ))}
            </div>
          )}
          {model.assignedSaleOnly && <p className="text-sm text-slate-700">{t("section.assignedSaleOnly")}</p>}
          {(model.open !== null || model.archived.length > 0) && (
            <ul className="divide-y divide-slate-100">
              {model.open !== null && <ListingRow line={model.open} />}
              {model.archived.map((line) => (
                <ListingRow key={line.listingId} line={line} />
              ))}
            </ul>
          )}
          {model.older && <p className="text-sm text-slate-500">{t("section.older")}</p>}
        </div>
      )}
    </section>
  );
}
