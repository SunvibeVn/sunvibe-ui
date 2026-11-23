"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { formValues, sameValues } from "../lib/revision-form";
import { type RevisionPanelInput, revisionPanelModel, type RevisionRun } from "../lib/revision-model";
import { runRevisionStart } from "../lib/revision-start-flow";
import { answerKey, problemSentence } from "../lib/revision-text";
import { runRevisionWithdraw } from "../lib/revision-withdraw-flow";
import { getListingRevision, startListingRevision, withdrawListingRevision } from "../services/revision-api";
import type { ListingRevisionDetail } from "../types";

import { RevisionContentSection } from "./revision-content-section";
import { RevisionDraftForm } from "./revision-draft-form";
import { RevisionProblemsNotice } from "./revision-problems-notice";
import { type RevisionRefusal, useRevisionCommand } from "./use-revision-command";

/** The answer of the revision read, with the number and the attempt it was read for. */
type RevisionRead = { revisionNo: number; attempt: number; result: ApiResult<ListingRevisionDetail> };

/** The page's `outsideChange` last seen, the read attempt it started (null before any, or with no open revision). */
type OutsideRead = { seen: number; attempt: number | null; failed: boolean };

/** The last command's refusal: its sentence, or for the 422 its sentence over the entries' list, which takes the focus. */
function RefusalAlert({ refusal }: { refusal: RevisionRefusal }) {
  const t = useTranslations("ListingPublish");
  const sentence = t(answerKey(refusal.answer));
  return (
    <Alert tone="error">
      {refusal.answer === "notSubmittable" && refusal.problems.length > 0 ? (
        <RevisionProblemsNotice heading={sentence} problems={refusal.problems.map(problemSentence)} focusOnMount />
      ) : (
        <p>{sentence}</p>
      )}
    </Alert>
  );
}

/**
 * "Current revision" on the listing page (listing-publish US-2 AC-1 to AC-6, spec section 6): it reads the listing's
 * open revision (Draft or Pending review). For the assigned Sale a Draft is the form and a Pending review revision
 * offers "Withdraw", asked first; anyone else reads the content. With no open revision the assigned Sale may start a
 * new empty Draft. One command runs at a time; after each the listing and the revision read again without returning to
 * "loading", every command waiting until both answered (the new data version), and the answer's sentence shows in one
 * alert. The commands are a hint: the server decides each. The panel repeats none of the page's texts.
 */
export function RevisionPanel({
  listingId,
  panel,
  listingRereading,
  onListingChanged,
  outsideChange = 0,
  outsideRereading = false,
}: {
  listingId: string;
  panel: RevisionPanelInput;
  /** The page's read of the listing asked for by `onListingChanged` has not answered yet. */
  listingRereading: boolean;
  onListingChanged: () => void;
  /** Moves when a record moved the listing's data version (E06S3-D12): the open revision is read again. */
  outsideChange?: number;
  /** The page's read of the listing asked for by a record has not answered yet: the body waits for it. */
  outsideRereading?: boolean;
}) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  const [read, setRead] = useState<RevisionRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  /** Moves when the next read must replace what the form holds: after a save, or after someone else's change. */
  const [valuesToken, setValuesToken] = useState(0);
  const adoptNextRead = useRef(false);
  /** The last `outsideChange` seen, the read attempt it started (none with no open revision) and whether it failed. */
  const [outside, setOutside] = useState<OutsideRead>({ seen: outsideChange, attempt: null, failed: false });
  /** An outside read found the stored revision changed and replaced what was shown (E06S3-D12 (ii)). */
  const [changedMeanwhile, setChangedMeanwhile] = useState(false);
  const keepId = useId();
  const revisionNo = panel.openRevisionNo;

  // A new `outsideChange` (a record moved the data version) reads the open revision again, in the render-time form the
  // draft form uses for `valuesToken`. It does not set `adoptNextRead`: its read compares what it finds (E06S3-D12). A
  // pending adoption of the panel's own command stays set, so that read adopts as the superseded one would (E06S3-P16).
  if (outside.seen !== outsideChange) {
    const next = revisionNo === null ? null : attempt + 1;
    setOutside({ seen: outsideChange, attempt: next ?? outside.attempt, failed: false });
    if (next !== null) {
      setAttempt(next);
      setChangedMeanwhile(false);
    }
  }
  /** The outside read has not answered, or failed: the body is held until it answers (E06S3-D12 (iii)). */
  const outsidePending = outside.attempt !== null && outside.attempt === attempt && (read === null || read.attempt !== attempt);
  const held = outsideRereading || outsidePending;

  // A read that `reread` asked for has not answered: the listing's, or the shown revision's (read for an older attempt).
  // An outside read is not one: no command's pending label shows for a record (E06S3-D12 (d)); the body is held instead.
  const rereading =
    listingRereading || (read !== null && read.revisionNo === revisionNo && read.attempt !== attempt && attempt !== outside.attempt);
  const { busy, refusal, run } = useRevisionCommand({
    rereading,
    onOutcome: (command, outcome) => {
      if ((command === "save" && outcome.kind === "done") || (outcome.kind === "refused" && outcome.answer === "concurrent")) {
        adoptNextRead.current = true;
      }
      if (command === "withdraw") setConfirming(false);
    },
  });
  /** A command of the panel starts: the "changed meanwhile" sentence is cleared, as the refusal alert is. */
  const runCommand: RevisionRun = (command, send) => {
    setChangedMeanwhile(false);
    return run(command, send);
  };

  const listingGone = useEffectEvent(() => onListingChanged());

  /**
   * The read's answer. An outside read (no adoption pending) compares the stored values and status with the read shown:
   * the same keeps what is typed and takes the new version (i); others are adopted and said (ii); a failure other than
   * 404 keeps what is shown, held, with "Try again" (iii); a 404 is today's (iv). Every other read is today's.
   */
  const answered = useEffectEvent((number: number, forAttempt: number, result: ApiResult<ListingRevisionDetail>) => {
    if (forAttempt === outside.attempt && !adoptNextRead.current && !(!result.ok && result.kind === "http" && result.status === 404)) {
      if (!result.ok) {
        setOutside((current) => ({ ...current, failed: true }));
        return;
      }
      const shown = read !== null && read.revisionNo === number && read.result.ok ? read.result.data : null;
      const same = shown !== null && shown.status === result.data.status && sameValues(formValues(shown), formValues(result.data));
      if (shown !== null && !same) {
        setValuesToken((token) => token + 1);
        setChangedMeanwhile(true);
      }
      setOutside((current) => ({ ...current, failed: false }));
      setRead({ revisionNo: number, attempt: forAttempt, result });
      return;
    }
    if (adoptNextRead.current && result.ok) {
      adoptNextRead.current = false;
      setValuesToken((token) => token + 1);
    }
    setRead({ revisionNo: number, attempt: forAttempt, result });
    // The one 404 of an unknown or out-of-scope revision: the page reads the listing again (spec section 6).
    if (!result.ok && result.kind === "http" && result.status === 404) listingGone();
  });

  useEffect(() => {
    if (revisionNo === null) return;
    let dropped = false;
    void getListingRevision(listingId, revisionNo).then((result) => {
      if (dropped) return;
      answered(revisionNo, attempt, result);
    });
    return () => {
      dropped = true;
    };
  }, [listingId, revisionNo, attempt]);

  // The question opens on its safe answer: "Keep it" takes the focus (A-7).
  useEffect(() => {
    if (confirming) document.getElementById(keepId)?.focus();
  }, [confirming, keepId]);

  const reread = () => {
    setAttempt((count) => count + 1);
    onListingChanged();
  };
  const retry = () => {
    setRead(null);
    setAttempt((count) => count + 1);
  };
  // "Try again" after a failed outside read: another outside attempt with the same comparison, what is shown kept.
  const retryOutside = () => {
    setOutside((current) => ({ ...current, attempt: attempt + 1, failed: false }));
    setAttempt(attempt + 1);
    setChangedMeanwhile(false);
  };
  const start = () =>
    void runCommand("start", () =>
      runRevisionStart(listingId, panel.dataVersion, { start: (id, version) => startListingRevision(id, version), reread }),
    );

  const model = read !== null && read.revisionNo === revisionNo ? revisionPanelModel(read.result, panel) : null;
  if (revisionNo !== null && model?.kind === "hidden") return null;

  let body;
  if (revisionNo === null) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">{t("revision.none")}</p>
        {panel.viewerMayDraft && (
          <Button className="px-4 py-2" pending={busy === "start"} disabled={busy !== null} onClick={start}>
            {busy === "start" ? t("revision.starting") : t("revision.start")}
          </Button>
        )}
      </div>
    );
  } else if (model === null) {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("revision.loading")}
      </p>
    );
  } else if (model.kind === "error") {
    body = (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{t("revision.loadFailed")}</p>
        </Alert>
        <Button variant="secondary" className="px-4 py-2" onClick={retry}>
          {t("revision.retry")}
        </Button>
      </div>
    );
  } else if (model.kind === "notFound") {
    body = (
      <Alert tone="info">
        <p>{t("revision.answers.notFound")}</p>
      </Alert>
    );
  } else if (model.kind === "ready") {
    const { screen } = model;
    const withdraw = () =>
      void runCommand("withdraw", () =>
        runRevisionWithdraw(listingId, screen.revisionNo, screen.dataVersion, {
          withdraw: (id, number, version) => withdrawListingRevision(id, number, version),
          reread,
        }),
      );
    body = (
      <div className="space-y-4">
        <p className="text-sm font-medium text-slate-900">
          {t("revision.statusLine", { revisionNo: screen.revisionNo, status: t(screen.statusKey) })}
        </p>
        {model.mode === "edit" ? (
          <RevisionDraftForm
            key={screen.revisionNo}
            listingId={listingId}
            screen={screen}
            values={model.values}
            valuesToken={valuesToken}
            busy={busy}
            run={runCommand}
            reread={reread}
          />
        ) : (
          <RevisionContentSection screen={screen} />
        )}
        {model.mayWithdraw &&
          (confirming ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-900">{t("revision.withdrawConfirm")}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="px-4 py-2" pending={busy === "withdraw"} disabled={busy !== null} onClick={withdraw}>
                  {busy === "withdraw" ? t("revision.withdrawing") : t("revision.withdrawYes")}
                </Button>
                <Button id={keepId} variant="secondary" className="px-4 py-2" disabled={busy !== null} onClick={() => setConfirming(false)}>
                  {t("revision.withdrawNo")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="px-4 py-2" disabled={busy !== null} onClick={() => setConfirming(true)}>
              {t("revision.withdraw")}
            </Button>
          ))}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("revision.heading")}
      </h2>
      {refusal !== null && <RefusalAlert refusal={refusal} />}
      {changedMeanwhile && (
        <Alert tone="info">
          <p>{t("revision.changedMeanwhile")}</p>
        </Alert>
      )}
      {/* Held while the reads after a record run: the fields keep what is typed, no button takes a click. */}
      <fieldset disabled={held} className="contents">
        {body}
      </fieldset>
      {outside.failed && (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("revision.rereadFailed")}</p>
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={retryOutside}>
            {t("revision.retry")}
          </Button>
        </div>
      )}
    </section>
  );
}
