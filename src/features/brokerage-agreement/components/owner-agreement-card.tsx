"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";

import type { OwnerAgreementModel, OwnerVersionModel } from "../lib/owner-agreements-model";
import { phraseText } from "../lib/version-terms-model";

import { FeePolicyPanel } from "./fee-policy-panel";
import { VersionTermsPanel } from "./version-terms-panel";

type OwnerAgreementCardProps = {
  agreement: OwnerAgreementModel;
  /** The version numbers of this agreement ticked for the confirmation below the list. */
  tickedVersions: readonly number[];
  /** False once 20 versions are ticked (brokerage-agreement S5-D5): a box not ticked is disabled then. */
  canTickMore: boolean;
  onTick: (versionNo: number, ticked: boolean) => void;
  /** "Decline": the page opens the decline dialog for this version. */
  onDecline: (versionNo: number) => void;
};

/**
 * One agreement on the owner's page (brokerage-agreement US-2 AC-1, S5-D17): the unit, its location when known and the
 * type, then each sent version, newest first, with its state, its period and the read-only terms and fee panels, never
 * marked "proposed". The version waiting for the owner's answer also shows the statement, the box that ticks it for the
 * confirmation and "Decline". Shown to the owner only (BR-17).
 */
export function OwnerAgreementCard({ agreement, tickedVersions, canTickMore, onTick, onDecline }: OwnerAgreementCardProps) {
  const t = useTranslations("BrokerageAgreement");
  const headingId = useId();

  return (
    <li aria-labelledby={headingId} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-1">
        <h2 id={headingId} className="text-base font-semibold text-navy-950">
          {phraseText(t, agreement.unit)}
        </h2>
        {agreement.locationLines.map((line, index) => (
          <p key={`${index}:${line}`} className="break-words text-sm text-slate-700">
            {line}
          </p>
        ))}
        <p className="text-sm text-slate-500">{t(agreement.transactionTypeKey)}</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {agreement.versions.map((version, index) => (
          <OwnerVersionItem
            key={`${index}:${version.versionNo}`}
            version={version}
            ticked={tickedVersions.includes(version.versionNo)}
            canTickMore={canTickMore}
            onTick={onTick}
            onDecline={onDecline}
          />
        ))}
      </ul>
    </li>
  );
}

type OwnerVersionItemProps = {
  version: OwnerVersionModel;
  ticked: boolean;
  canTickMore: boolean;
  onTick: (versionNo: number, ticked: boolean) => void;
  onDecline: (versionNo: number) => void;
};

function OwnerVersionItem({ version, ticked, canTickMore, onTick, onDecline }: OwnerVersionItemProps) {
  const t = useTranslations("BrokerageAgreement");
  const boxId = useId();

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">{t("detail.version", { number: version.versionNo })}</h3>
        <p className="text-sm text-slate-700">{phraseText(t, version.state)}</p>
        {version.reason !== null && (
          <p className="break-words text-sm text-slate-700">{t("owner.reason", { reason: version.reason })}</p>
        )}
      </div>
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
      <VersionTermsPanel content={version.content} />
      <FeePolicyPanel view={version.fee} />
      {version.answerable && (
        <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
          <p className="whitespace-pre-line break-words text-sm text-slate-900">{version.statementText}</p>
          <div className="flex items-start gap-2">
            <input
              id={boxId}
              type="checkbox"
              checked={ticked}
              disabled={!ticked && !canTickMore}
              onChange={(event) => onTick(version.versionNo, event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-violet-700 disabled:cursor-not-allowed"
            />
            <label htmlFor={boxId} className="text-sm font-medium text-slate-900">
              {t("owner.tick", { number: version.versionNo })}
            </label>
          </div>
          <Button variant="secondary" className="px-4 py-2" onClick={() => onDecline(version.versionNo)}>
            {t("owner.decline")}
          </Button>
        </div>
      )}
    </li>
  );
}
