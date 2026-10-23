"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { parseDuplicateInput } from "../lib/duplicate-input";
import { formatDateTime } from "../lib/format";
import { statusLabelKey } from "../lib/labels";
import type { OriginalPreview, OriginalProblem, OriginalResolution } from "../lib/status-flow";
import type { DuplicateCandidate } from "../types";

/** Which way the original is given: a candidate of the lead, or the text field (link or request code). */
export type OriginalPick = { kind: "candidate"; id: string } | { kind: "text" } | null;

/** The result of the last "Find", for the text it was made for. */
export type OriginalLookup = { text: string; resolution: OriginalResolution };

const PROBLEM_KEY = {
  required: "statusDialog.duplicate.required",
  invalid: "statusDialog.duplicate.invalid",
  self: "statusDialog.duplicate.isSelf",
  duplicate: "statusDialog.duplicate.isDuplicate",
  "not-found": "statusDialog.duplicate.notFound",
} as const satisfies Record<OriginalProblem, string>;

/** "SV-XXXX-XXXX · Declined · 01/10/2026 10:00", or "Lead ID: <id>" for a pasted link (no preview, C-21). */
export function useOriginalText(): (original: OriginalPreview) => string {
  const t = useTranslations("OwnerLeads");
  return (original) =>
    original.requestCode === undefined
      ? t("statusDialog.duplicate.linkPreview", { id: original.id })
      : t("statusDialog.duplicate.preview", {
          code: original.requestCode,
          status: t(statusLabelKey(original.status)),
          createdAt: original.createdAt === undefined ? "" : formatDateTime(original.createdAt),
        });
}

export function useOriginalProblemText(): (problem: OriginalProblem) => string {
  const t = useTranslations("OwnerLeads");
  return (problem) => t(PROBLEM_KEY[problem]);
}

type DuplicatePickerProps = {
  leadId: string;
  candidates: readonly DuplicateCandidate[];
  pick: OriginalPick;
  onPick(pick: OriginalPick): void;
  /** The pasted link or code (a draft). */
  text: string;
  onText(text: string): void;
  lookup: OriginalLookup | null;
  onLookup(): void;
  /** The lookup is running: its button says "Finding…". */
  looking: boolean;
  disabled: boolean;
  /** Message of the last submit for the original (client check or the server's 400). */
  error?: string;
};

/**
 * The original of a DUPLICATE (spec 5.4, C-21): one of the lead's possible duplicates (those already in DUPLICATE are
 * disabled), or a pasted workspace lead link or request code. A code is previewed after "Find" (code, status, date); a
 * link shows only the id and the server decides. The lead itself is refused at once.
 */
export function DuplicatePicker({
  leadId,
  candidates,
  pick,
  onPick,
  text,
  onText,
  lookup,
  onLookup,
  looking,
  disabled,
  error,
}: DuplicatePickerProps) {
  const t = useTranslations("OwnerLeads");
  const groupName = useId();
  const inputId = useId();
  const hintId = useId();
  const originalText = useOriginalText();
  const problemText = useOriginalProblemText();

  const textPicked = candidates.length === 0 || pick?.kind === "text";

  // What the text says right now: a link shows its id at once; a code shows the result of "Find" made for this text.
  const parsed = parseDuplicateInput(text);
  let preview: string | null = null;
  let problem: string | null = null;
  if (textPicked && text.trim() !== "") {
    if (parsed.kind === "id") {
      if (parsed.id.toUpperCase() === leadId.toUpperCase()) problem = problemText("self");
      else preview = originalText({ id: parsed.id });
    } else if (parsed.kind === "code" && lookup !== null && lookup.text === text) {
      if (lookup.resolution.kind === "found") preview = originalText(lookup.resolution.original);
      else if (lookup.resolution.kind === "problem") problem = problemText(lookup.resolution.problem);
    }
  }
  // The submit message wins; the same refusal is not shown twice.
  const fieldError = error ?? (problem === null ? undefined : problem);

  const textField = (
    <FormField id={inputId} label={t("statusDialog.duplicate.input")} error={fieldError}>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={text}
          autoComplete="off"
          spellCheck={false}
          invalid={fieldError !== undefined}
          aria-describedby={describedBy(inputId, fieldError)}
          onChange={(event) => onText(event.target.value)}
        />
        {parsed.kind === "code" && (
          <Button
            variant="secondary"
            className="shrink-0 px-4 py-2"
            pending={looking}
            disabled={disabled}
            onClick={onLookup}
          >
            {looking ? t("statusDialog.duplicate.looking") : t("statusDialog.duplicate.lookup")}
          </Button>
        )}
      </div>
      {preview !== null && fieldError === undefined && (
        <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800" aria-live="polite">
          {preview}
        </p>
      )}
    </FormField>
  );

  return (
    <fieldset className="space-y-3" aria-describedby={hintId}>
      <legend className="text-sm font-medium text-slate-700">{t("statusDialog.duplicate.title")}</legend>
      <p id={hintId} className="text-xs text-slate-500">
        {t("statusDialog.duplicate.hint")}
      </p>
      {candidates.length === 0 ? (
        textField
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{t("statusDialog.duplicate.candidates")}</p>
          {candidates.map((candidate, index) => {
            const id = candidate.id;
            const blocked =
              id === undefined || candidate.status === "DUPLICATE" || id.toUpperCase() === leadId.toUpperCase();
            const label = originalText({
              id: id ?? "",
              requestCode: candidate.requestCode ?? "",
              status: candidate.status,
              createdAt: candidate.createdAt,
            });
            return (
              <label
                key={id ?? `candidate-${index}`}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${blocked ? "text-slate-400" : "text-slate-800 hover:bg-slate-50"}`}
              >
                <input
                  type="radio"
                  name={groupName}
                  className="mt-0.5 h-4 w-4 accent-violet-700"
                  disabled={blocked || disabled}
                  checked={pick?.kind === "candidate" && pick.id === id}
                  onChange={() => id !== undefined && onPick({ kind: "candidate", id })}
                />
                <span>
                  {label}
                  {candidate.status === "DUPLICATE" && (
                    <span className="block text-xs">{t("statusDialog.duplicate.candidateDisabled")}</span>
                  )}
                </span>
              </label>
            );
          })}
          <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
            <input
              type="radio"
              name={groupName}
              className="mt-0.5 h-4 w-4 accent-violet-700"
              disabled={disabled}
              checked={pick?.kind === "text"}
              onChange={() => onPick({ kind: "text" })}
            />
            <span>{t("statusDialog.duplicate.other")}</span>
          </label>
          {textPicked ? (
            <div className="pl-6">{textField}</div>
          ) : (
            error !== undefined && <p className="text-sm text-rose-600">{error}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
