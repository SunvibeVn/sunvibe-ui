"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CHECKLIST_GROUP_NAME, type ChecklistCorrectionInput, type ChecklistInput } from "@/features/surveys";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { otherGroupVersions } from "../../lib/checklist/answer-merge";
import { rebaseDraft } from "../../lib/checklist/checklist-draft";
import { compareRows, unitLabel } from "../../lib/checklist/compare-view";
import { cascadeReasons, correctionReasons, type CorrectionReason, g1Cascades } from "../../lib/checklist/correction-rule";
import { idle, type NotSavedReason, panelEvent, type PanelState, saveFailureEvent, startSave } from "../../lib/checklist/panel-state";
import { spaceCodes } from "../../lib/checklist/readiness-view";
import { sameUnit } from "../../lib/checklist/unit-equality";
import { unitPath } from "../../lib/checklist/unit-path";
import { type ChecklistProblems, checkGroupInput } from "../../schemas/checklist";

import { useChecklistPage } from "./checklist-context";
import { CorrectionBox } from "./correction-box";
import type { Panel } from "./use-panel";

type ReasonKey = "reasonInvalid" | "reasonServer" | "reasonFailed" | "reasonForbidden" | "reasonIneligible" | "reasonStale";

const REASON_KEY: Record<NotSavedReason, ReasonKey> = {
  invalid: "reasonInvalid",
  server: "reasonServer",
  failed: "reasonFailed",
  network: "reasonFailed",
  forbidden: "reasonForbidden",
  ineligible: "reasonIneligible",
  stale: "reasonStale",
};

type GroupPanelProps = {
  panel: Panel;
  /** G-number of the group (1..8). */
  no: number;
  children: (problems: ChecklistProblems) => ReactNode;
};

/**
 * One group of the Edit tab (survey-checklist spec 6.2): its own Save and status ("Saved <time> by <name>", "Unsaved
 * changes", "Saving…", "Not saved: <reason>"), the page's checks, the correction box when the rule of 4.5 asks for one
 * or the server's 400 names `correction`, and the compare view after a 409 ("Save mine on top", "Discard mine"). Only
 * this panel waits for its save, except a G1 save that removes a space or switches the scope (A-12).
 */
export function GroupPanel({ panel, no, children }: GroupPanelProps) {
  const t = useTranslations("OwnerLeads");
  const page = useChecklistPage();
  const { view, userId } = page;
  const [state, setState] = useState<PanelState>(idle);
  const [reasons, setReasons] = useState<CorrectionReason[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  /** Set while a PUT is on its way, so a second click in the same frame sends nothing (Review Focus 3). */
  const saving = useRef(false);
  const name = CHECKLIST_GROUP_NAME[panel.group];
  const codes = spaceCodes(view);
  const groupView = view.groups?.[panel.group];
  const dirty = Object.keys(panel.edits).length > 0;
  const cascade = panel.group === "identification" && g1Cascades(view, panel.input as ChecklistInput["identification"]);

  const save = async (correction: ChecklistCorrectionInput | null) => {
    if (saving.current || panel.locked) return;
    // Units left as stored keep their receiver and relay basis (A-18): only changed statements are checked.
    const unchangedPaths = new Set<string>();
    for (const [key, value] of panel.units) {
      if (!panel.storedUnits.has(key) || !sameUnit(panel.storedUnits.get(key), value)) continue;
      const path = unitPath(panel.group, panel.input as never, key);
      if (path !== null) unchangedPaths.add(path);
    }
    const problems = checkGroupInput(panel.group, panel.input as never, { ...page.rules, unchangedPaths });
    if (Object.keys(problems).length > 0) {
      setState((prev) => panelEvent(prev, { type: "invalid", problems }));
      return;
    }
    if (correction === null) {
      const found = [
        ...correctionReasons(panel.group, panel.content as never, panel.input as never, userId, view.visit, page.ctx),
        ...(cascade ? cascadeReasons(view, panel.input as ChecklistInput["identification"], userId) : []),
      ];
      if (found.length > 0) {
        setReasons(found);
        setState((prev) => panelEvent(prev, { type: "correction", server: false }));
        return;
      }
    }
    const started = startSave(state);
    if (!started.accepted) return;
    saving.current = true;
    setState(started.state);
    const body = {
      expectedVersion: panel.draftVersion ?? panel.version,
      correction,
      content: panel.input,
      ...(panel.group === "identification" ? { otherGroupVersions: otherGroupVersions(view) } : {}),
    };
    const submitted = panel.draftText;
    const outcome = await page.save(panel.group, body as never, cascade);
    saving.current = false;
    if (outcome.kind === "saved") {
      panel.clearDraft(submitted);
      page.clearNotKept(panel.group);
      setKept([]);
      setReasons([]);
      setState(idle());
      return;
    }
    const event = saveFailureEvent(outcome.error);
    if (event.type === "correction") {
      // The server's rule found what the page cannot see (a tombstone): the box opens and the edits stay (A-29).
      const others: ChecklistProblems = {};
      for (const path of Object.keys(outcome.error.fieldErrors ?? {})) if (path !== "correction") others[path] = "server";
      setState({ ...panelEvent(started.state, event), problems: others });
      return;
    }
    setState(panelEvent({ ...started.state, status: "idle" }, event));
  };

  let status: string;
  if (state.status === "saving") status = t("checklist.panel.saving");
  else if (state.status === "failed" && state.reason === "network") status = t("checklist.panel.notSavedNetwork");
  else if (state.status === "failed" && state.reason === "stale")
    status = t("checklist.panel.notSaved", {
      reason: t("checklist.panel.reasonStale", {
        group: t(`checklist.groups.${CHECKLIST_GROUP_NAME[state.staleGroup ?? panel.group]}`),
      }),
    });
  else if (state.status === "failed" && state.reason !== null)
    status = t("checklist.panel.notSaved", { reason: t(`checklist.panel.${REASON_KEY[state.reason]}` as "checklist.panel.reasonFailed") });
  else if (state.status === "correction") status = t("checklist.panel.notSaved", { reason: t("checklist.panel.reasonCorrection") });
  else if (dirty) status = t("checklist.panel.unsaved");
  else if (groupView?.updatedAt)
    status = t("checklist.panel.savedBy", {
      when: formatDateTime(groupView.updatedAt),
      name: groupView.updatedByName?.trim() || t("survey.unknownPerson"),
    });
  else status = t("checklist.panel.neverSaved");

  const notKept = [...(page.notKept[panel.group] ?? []), ...kept];
  const failed = state.status === "failed";

  return (
    <section
      id={`cl-group-${panel.group}`}
      aria-labelledby={`cl-group-${panel.group}-title`}
      className="scroll-mt-32 space-y-4 md:scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`cl-group-${panel.group}-title`} className="text-base font-semibold text-slate-900">
          {t("checklist.panel.groupTitle", { no, name: t(`checklist.groups.${name}`) })}
        </h2>
        <p role="status" aria-live="polite" className={`text-sm ${failed || state.status === "correction" ? "text-rose-700" : "text-slate-600"}`}>
          {status}
        </p>
      </div>

      {notKept.length > 0 && (
        <Alert tone="info">{t("checklist.panel.notKept", { items: notKept.map((key) => unitLabel(key, codes, t)).join(", ") })}</Alert>
      )}

      {panel.conflict && (
        <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">{t("checklist.panel.conflict")}</p>
          <ul className="space-y-2 text-sm">
            {compareRows(panel.edits, panel.storedUnits, codes, t).map((row) => (
              <li key={row.key} className="rounded-lg bg-white px-3 py-2">
                <p className="font-medium text-slate-900">{row.label}</p>
                <p className="break-words text-slate-700">
                  {t("checklist.panel.savedNow")}: {row.savedNow}
                </p>
                <p className="break-words text-slate-700">
                  {t("checklist.panel.yours")}: {row.yours}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={panel.locked}
              onClick={() => {
                const rebased = rebaseDraft(
                  { version: panel.draftVersion ?? panel.version, edits: panel.edits, created: [...panel.created] },
                  panel.group,
                  panel.content as never,
                  page.ctx,
                );
                setKept(rebased.dropped);
                panel.replaceDraft(panel.version, rebased.edits);
              }}
            >
              {t("checklist.panel.saveMine")}
            </Button>
            <Button variant="secondary" disabled={panel.locked} onClick={() => panel.clearDraft()}>
              {t("checklist.panel.discardMine")}
            </Button>
          </div>
        </div>
      )}

      {children(state.problems)}

      {state.status === "correction" ? (
        <CorrectionBox
          reasons={reasons}
          server={state.serverCorrection}
          rules={page.rules}
          pending={panel.locked}
          onSubmit={(correction) => void save(correction)}
          onCancel={() => setState(idle())}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button pending={state.status === "saving"} disabled={panel.locked || !dirty || panel.conflict} onClick={() => void save(null)}>
            {state.status === "saving" ? t("checklist.panel.saving") : t("checklist.panel.save")}
          </Button>
          {panel.locked && state.status !== "saving" && <p className="text-sm text-slate-600">{t("checklist.panel.locked")}</p>}
        </div>
      )}
    </section>
  );
}
