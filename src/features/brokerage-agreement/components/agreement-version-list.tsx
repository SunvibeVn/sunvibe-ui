import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import type { VersionActivationLines, VersionAnswer, VersionRow } from "../lib/agreement-model";
import type { EligibilityKey } from "../lib/reason-text";
import { type Phrase, phraseText } from "../lib/version-terms-model";

import { FeePolicyPanel } from "./fee-policy-panel";
import { VersionTermsPanel } from "./version-terms-panel";

/** The answer's time is formatted as the sent time is (the page's provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

const ANSWER_TEXT = {
  awaiting: "answer.awaiting",
  confirmed: "answer.confirmed",
  rejected: "answer.rejected",
  lapsed: "answer.lapsed",
  notActivated: "answer.notActivated",
} as const satisfies Record<VersionAnswer["kind"], EligibilityKey>;

/**
 * The owner's answer to a sent version (brokerage-agreement E05-S5, S5-D13): until when they may answer, when they
 * confirmed or declined it and why, or by when they did not answer; for a confirmed version no manager activated in 14
 * days, by when it was not activated (E05-S6, S6-D5).
 */
function AnswerLines({ answer, time }: { answer: VersionAnswer; time: string }) {
  const t = useTranslations("BrokerageAgreement");
  return (
    <>
      <p className="text-sm text-slate-700">{t(ANSWER_TEXT[answer.kind], { time })}</p>
      {answer.kind === "rejected" && (
        <p className="break-words text-sm text-slate-700">
          {answer.reasonOrNull === null ? t("answer.noReason") : t("answer.reason", { reason: answer.reasonOrNull })}
        </p>
      )}
    </>
  );
}

/**
 * A manager's activation decision on a version (brokerage-agreement E05-S6, S6-D3, S6-D4, S6-D22): activated with its
 * start date, or in effect, with the signed document's values; or refused with its reason and the note. Private values
 * (BR-17), shown as text only. The decision's time is formatted as the answer's time is.
 */
function ActivationLines({ lines }: { lines: VersionActivationLines }) {
  const t = useTranslations("BrokerageAgreement");
  const format = useFormatter();
  const time = lines.decidedAt === null ? null : format.dateTime(new Date(lines.decidedAt), TIME_FORMAT);
  const timed = (phrase: Phrase | null) =>
    phrase === null || time === null ? null : phraseText(t, { ...phrase, values: { ...phrase.values, time } });
  const first = timed(lines.first);
  const refusal = timed(lines.refusal);
  return (
    <>
      {first !== null && <p className="break-words text-sm text-slate-700">{first}</p>}
      {lines.document !== null && <p className="break-words text-sm text-slate-700">{phraseText(t, lines.document)}</p>}
      {refusal !== null && <p className="break-words text-sm text-slate-700">{refusal}</p>}
      {lines.note !== null && (
        <p className="break-words text-sm text-slate-700">{t("versionActivation.note", { note: lines.note })}</p>
      )}
    </>
  );
}

type VersionListProps = {
  versions: VersionRow[];
  /** The edit form of the draft (brokerage-agreement E05-S3): shown for that version in place of its period and content. */
  draftEditor?: { versionNo: number; node: ReactNode };
};

/**
 * The versions of an agreement, by number: each with its state, its period as calendar dates, when it was sent to the
 * owner (brokerage-agreement E05-S4), the owner's answer (E05-S5), a manager's activation decision (E05-S6), its content
 * and its fee policy.
 */
export function AgreementVersionList({ versions, draftEditor }: VersionListProps) {
  const t = useTranslations("BrokerageAgreement");
  const format = useFormatter();

  return (
    <ul className="divide-y divide-slate-100">
      {versions.map((version, index) => (
        <li key={`${index}:${version.versionNo}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{t("detail.version", { number: version.versionNo })}</h3>
            <Badge tone="neutral">{t(version.statusKey)}</Badge>
          </div>
          {draftEditor !== undefined && draftEditor.versionNo === version.versionNo ? (
            draftEditor.node
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">{t("detail.startDate")}</dt>
                  <dd className="text-slate-900">{version.startText}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("detail.endDate")}</dt>
                  <dd className="text-slate-900">{version.endText}</dd>
                </div>
              </dl>
              {version.sentAt !== null && (
                <p className="text-sm text-slate-700">
                  {t("detail.sentAt", {
                    time: format.dateTime(new Date(version.sentAt), { dateStyle: "medium", timeStyle: "short" }),
                  })}
                </p>
              )}
              {version.answer !== null && (
                <AnswerLines answer={version.answer} time={format.dateTime(new Date(version.answer.time), TIME_FORMAT)} />
              )}
              {version.activation !== undefined && <ActivationLines lines={version.activation} />}
              <VersionTermsPanel content={version.content} />
              <FeePolicyPanel view={version.fee} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
