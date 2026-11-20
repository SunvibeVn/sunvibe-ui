"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { codePointCount, type RevisionFormValues, sameValues } from "../lib/revision-form";
import type { RevisionCommand, RevisionRun, RevisionScreen } from "../lib/revision-model";
import { runRevisionSave } from "../lib/revision-save-flow";
import { runRevisionSubmit } from "../lib/revision-submit-flow";
import { saveListingRevisionContent, submitListingRevision } from "../services/revision-api";

import { RevisionFeaturesSection } from "./revision-features-section";
import { RevisionProblemsNotice } from "./revision-problems-notice";
import { RevisionTermsSection } from "./revision-terms-section";

type DraftFormProps = {
  listingId: string;
  screen: RevisionScreen;
  /** The values of the last read. */
  values: RevisionFormValues;
  /** Changes when the panel's last read must replace what is typed: after a save, or after someone else's change. */
  valuesToken: number;
  busy: RevisionCommand | null;
  run: RevisionRun;
  reread: () => void;
};

/**
 * The assigned Sale's Draft (listing-publish US-2 AC-1 to AC-4, spec section 6): "Title" on one line and "Description"
 * with their counters (code points of the NFC text, display only: no rule of the server is copied here, E06S2-D9), the
 * thirteen features, "Save draft", the terms, what still stops a submission, and "Submit for review". Each command is
 * sent once through the panel's runner, its button reading its pending text. What is typed stays until a save lands or
 * someone else's change is read; while it differs from the stored draft, "Submit for review" waits for a save, since a
 * submission locks the stored revision, not the screen.
 */
export function RevisionDraftForm({ listingId, screen, values, valuesToken, busy, run, reread }: DraftFormProps) {
  const t = useTranslations("ListingPublish");
  const titleId = useId();
  const descriptionId = useId();
  const [typed, setTyped] = useState(values);
  const [token, setToken] = useState(valuesToken);
  if (token !== valuesToken) {
    setToken(valuesToken);
    setTyped(values);
  }

  const unsaved = !sameValues(typed, values);
  const running = busy !== null;
  const save = () =>
    void run("save", () =>
      runRevisionSave(listingId, screen.revisionNo, typed, screen.dataVersion, {
        save: (id, number, body) => saveListingRevisionContent(id, number, body),
        reread,
      }),
    );
  const submit = () =>
    void run("submit", () =>
      runRevisionSubmit(listingId, screen.revisionNo, screen.dataVersion, {
        submit: (id, number, version) => submitListingRevision(id, number, version),
        reread,
      }),
    );

  return (
    <form
      noValidate
      className="min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FormField id={titleId} label={t("revision.title")} hint={t("revision.titleCounter", { count: codePointCount(typed.title) })}>
        <Input
          id={titleId}
          value={typed.title}
          readOnly={running}
          aria-describedby={`${titleId}-hint`}
          onChange={(event) => {
            const { value } = event.target;
            setTyped((current) => ({ ...current, title: value }));
          }}
        />
      </FormField>
      <FormField
        id={descriptionId}
        label={t("revision.description")}
        hint={t("revision.descriptionCounter", { count: codePointCount(typed.description) })}
      >
        <Textarea
          id={descriptionId}
          rows={8}
          value={typed.description}
          readOnly={running}
          aria-describedby={`${descriptionId}-hint`}
          onChange={(event) => {
            const { value } = event.target;
            setTyped((current) => ({ ...current, description: value }));
          }}
        />
      </FormField>
      <RevisionFeaturesSection
        values={typed.features}
        disabled={running}
        onChange={(features) => setTyped((current) => ({ ...current, features }))}
      />
      <Button type="submit" className="px-4 py-2" pending={busy === "save"} disabled={running}>
        {busy === "save" ? t("revision.saving") : t("revision.saveDraft")}
      </Button>
      <RevisionTermsSection
        editable
        snapshot={screen.terms}
        listingId={listingId}
        revisionNo={screen.revisionNo}
        dataVersion={screen.dataVersion}
        busy={busy}
        run={run}
        reread={reread}
      />
      <RevisionProblemsNotice heading={t("revision.problems.heading")} problems={screen.problems} />
      <div className="space-y-2">
        {unsaved && <p className="text-sm text-slate-700">{t("revision.unsaved")}</p>}
        <Button className="px-4 py-2" pending={busy === "submit"} disabled={running || unsaved} onClick={submit}>
          {busy === "submit" ? t("revision.submitting") : t("revision.submit")}
        </Button>
      </div>
    </form>
  );
}
