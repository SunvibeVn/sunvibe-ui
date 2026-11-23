"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { ReasonGroupKey } from "../lib/listing-text";
import { type DisplayLines, type PublicationModel, publicationModel } from "../lib/publication-model";
import { ADVERTISING_REASON_KEY } from "../lib/publication-text";
import { runPutLive } from "../lib/put-live-flow";
import { runRevisionCopy } from "../lib/revision-copy-flow";
import type { ListingKey } from "../lib/revision-text";
import { getListingPublication, putListingRevisionLive } from "../services/publication-api";
import { copyListingRevision } from "../services/review-api";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

/** What the section shows and the read it answered (`refresh` and own attempt), so a re-read keeps it until it answers. */
type Shown = { model: PublicationModel; read: string };

/** The answer of the last command of this section, until the next one or a re-read the section did not ask for. */
type Answer =
  | { kind: "live"; revisionNo: number }
  | { kind: "refused"; revisionNo: number; reasonKeys: ListingKey[]; groupKeys: ReasonGroupKey[] }
  | { kind: "sentence"; sentence: ListingKey };

/** A command of the section while it runs: the put live, or the copy of one revision. */
type Busy = { kind: "idle" } | { kind: "putting" } | { kind: "copying"; revisionNo: number };

/** The reasons in their order, E05's groups listed under the advertising reason, every text from en.json. */
function ReasonList({ reasonKeys, groupKeys }: { reasonKeys: ListingKey[]; groupKeys: ReasonGroupKey[] }) {
  const t = useTranslations("ListingPublish");
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {reasonKeys.map((key, index) => (
        <li key={`${index}:${key}`} className="break-words">
          {t(key)}
          {key === ADVERTISING_REASON_KEY && groupKeys.length > 0 && (
            <ul className="mt-0.5 list-[circle] space-y-0.5 pl-5">
              {groupKeys.map((group, groupIndex) => (
                <li key={`${groupIndex}:${group}`}>{t(group)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Its display conditions hold." or "Its display conditions do not hold:" with one line per reason. */
function DisplayLinesView({ lines }: { lines: DisplayLines }) {
  const t = useTranslations("ListingPublish");
  if (lines.holds) return <p>{t("publication.holds")}</p>;
  return (
    <div className="space-y-1">
      <p>{t("publication.notHolds")}</p>
      <ReasonList reasonKeys={lines.reasonKeys} groupKeys={lines.groupKeys} />
    </div>
  );
}

/** "Copy into a new draft" beside one revision, described by that revision's line; "Copying…" while its copy runs. */
function CopyButton({ copying, held, describedBy, onCopy }: { copying: boolean; held: boolean; describedBy: string; onCopy: () => void }) {
  const t = useTranslations("ListingPublish");
  return (
    <Button variant="secondary" className="px-4 py-2" pending={copying} disabled={held} aria-describedby={describedBy} onClick={onCopy}>
      {copying ? t("decision.copying") : t("decision.copy")}
    </Button>
  );
}

/**
 * "Publication" on the listing page (listing-publish US-2 AC-7, US-5 AC-1, AC-3, spec section 6, E06S6-D11, D14): the
 * live revision and the Approved revision waiting, each with whether its display conditions hold now and why not;
 * "Put live" for the waiting revision and "Copy into a new draft" beside each, when the read permits them. It reads on
 * mount and again on every re-read of the page (`refresh`), keeping what it shows until the answer, and holds its
 * commands meanwhile, since the read's data version is the one they send. After a put live's 200 it says so and asks
 * the page to read again; a refusal lists its reasons, takes the focus and the section reads again. The UI computes
 * no condition: the server decides every command. Nothing here is public.
 */
export function PublicationSection({
  listingId,
  refresh,
  onListingChanged,
}: {
  listingId: string;
  /** The page's re-read counter: each change reads the section again. */
  refresh: number;
  /** The page reads the listing again (`reread("revision")`). */
  onListingChanged: () => void;
}) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const headingId = useId();
  const liveLineId = useId();
  const approvedLineId = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  /** Moves for the section's own re-read (after a refusal) and for "Try again". */
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState<Busy>({ kind: "idle" });
  /** Set while a command runs: a second press meanwhile sends nothing. */
  const sending = useRef(false);
  /** Set when this section asked for the next read, whose answer then keeps the command's answer on screen. */
  const asked = useRef(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const requested = `${refresh}:${attempt}`;

  useEffect(() => {
    let dropped = false;
    const own = asked.current;
    asked.current = false;
    const read = `${refresh}:${attempt}`;
    void getListingPublication(listingId).then((result) => {
      if (dropped) return;
      const next = publicationModel(result);
      // A failed re-read keeps what is shown, as the page does; the next command answers if the data version is old.
      setShown((current) =>
        current !== null && (current.model.kind === "ready" || current.model.kind === "archived") && next.kind === "error"
          ? { model: current.model, read }
          : { model: next, read },
      );
      if (!own) setAnswer(null);
    });
    return () => {
      dropped = true;
    };
  }, [listingId, refresh, attempt]);

  // An answer takes the focus, so a screen reader hears it at once.
  useLayoutEffect(() => {
    if (answer !== null) answerRef.current?.focus();
  }, [answer]);

  const model: PublicationModel = shown?.model ?? { kind: "loading" };
  if (model.kind === "none") return null;

  const rereading = shown === null || shown.read !== requested;
  const held = rereading || busy.kind !== "idle";

  const askListing = () => {
    asked.current = true;
    onListingChanged();
  };
  const retry = () => {
    setShown(null);
    setAttempt((count) => count + 1);
  };
  const putLive = (revisionNo: number, dataVersion: number) => {
    if (sending.current) return;
    sending.current = true;
    setBusy({ kind: "putting" });
    setAnswer(null);
    void runPutLive(
      { putLive: (id, number, version) => putListingRevisionLive(id, number, version) },
      { listingId, revisionNo, dataVersion },
    ).then((outcome) => {
      sending.current = false;
      setBusy({ kind: "idle" });
      switch (outcome.kind) {
        case "live":
          setAnswer({ kind: "live", revisionNo });
          askListing();
          break;
        case "refused":
          setAnswer({ kind: "refused", revisionNo, reasonKeys: outcome.reasonKeys, groupKeys: outcome.groupKeys });
          asked.current = true;
          setAttempt((count) => count + 1);
          break;
        case "sentence":
          setAnswer({ kind: "sentence", sentence: outcome.sentence });
          if (outcome.reread) askListing();
          break;
        case "silent":
          break;
      }
    });
  };
  const copyIt = (revisionNo: number, dataVersion: number) => {
    if (sending.current) return;
    sending.current = true;
    setBusy({ kind: "copying", revisionNo });
    setAnswer(null);
    void runRevisionCopy(
      { listingId, revisionNo, dataVersion },
      { copy: (id, number, version) => copyListingRevision(id, number, version), reread: askListing },
    ).then((outcome) => {
      sending.current = false;
      setBusy({ kind: "idle" });
      if (outcome.kind === "refused") setAnswer({ kind: "sentence", sentence: outcome.sentence });
    });
  };
  const copying = (revisionNo: number) => busy.kind === "copying" && busy.revisionNo === revisionNo;

  let body: ReactNode;
  switch (model.kind) {
    case "loading":
      body = (
        <p role="status" className="text-sm text-slate-500">
          {t("publication.loading")}
        </p>
      );
      break;
    case "error":
      body = (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("publication.loadError")}</p>
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={retry}>
            {t("page.retry")}
          </Button>
        </div>
      );
      break;
    case "archived":
      body = <p className="text-sm text-slate-700">{t("publication.archived")}</p>;
      break;
    case "ready": {
      const { live, approved, mayPutLive, mayCopy, dataVersion } = model;
      let notice: ReactNode = null;
      if (answer?.kind === "live") {
        notice = (
          <Alert tone="success">
            <p>{t("publication.liveNow", { revisionNo: answer.revisionNo })}</p>
          </Alert>
        );
      } else if (answer?.kind === "refused") {
        notice = (
          <Alert tone="error">
            <p>{t("publication.refused", { revisionNo: answer.revisionNo })}</p>
            <div className="mt-1">
              <ReasonList reasonKeys={answer.reasonKeys} groupKeys={answer.groupKeys} />
            </div>
          </Alert>
        );
      } else if (answer?.kind === "sentence") {
        notice = (
          <Alert tone="error">
            <p>{t(answer.sentence)}</p>
          </Alert>
        );
      }
      body = (
        <div className="space-y-4 text-sm text-slate-700">
          {notice !== null && (
            <div ref={answerRef} tabIndex={-1} className="focus:outline-none">
              {notice}
            </div>
          )}
          {live === null ? (
            <p>{t("publication.noLive")}</p>
          ) : (
            <div className="space-y-2">
              <p id={liveLineId} className="font-medium text-slate-900">
                {t("publication.liveSince", { revisionNo: live.revisionNo, time: format.dateTime(new Date(live.wentLiveAt), TIME_FORMAT) })}
              </p>
              <DisplayLinesView lines={live} />
              {mayCopy && (
                <CopyButton
                  copying={copying(live.revisionNo)}
                  held={held}
                  describedBy={liveLineId}
                  onCopy={() => copyIt(live.revisionNo, dataVersion)}
                />
              )}
            </div>
          )}
          {approved !== null && (
            <div className="space-y-2">
              <p id={approvedLineId} className="font-medium text-slate-900">
                {t("publication.waiting", { revisionNo: approved.revisionNo })}
              </p>
              <DisplayLinesView lines={approved} />
              {(mayPutLive || mayCopy) && (
                <div className="flex flex-wrap gap-2">
                  {mayPutLive && (
                    <Button
                      className="px-4 py-2"
                      pending={busy.kind === "putting"}
                      disabled={held}
                      onClick={() => putLive(approved.revisionNo, dataVersion)}
                    >
                      {t("publication.putLive")}
                    </Button>
                  )}
                  {mayCopy && (
                    <CopyButton
                      copying={copying(approved.revisionNo)}
                      held={held}
                      describedBy={approvedLineId}
                      onCopy={() => copyIt(approved.revisionNo, dataVersion)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
      break;
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("publication.title")}
      </h2>
      {body}
    </section>
  );
}
