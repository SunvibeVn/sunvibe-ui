"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { QUERY_MAX, type TextProblem } from "../lib/intake-text";
import { ASSET_TYPE_LABEL, labelOf } from "../lib/labels";
import { searchProblem, searchQuery } from "../lib/target-form";
import { searchInventory } from "../services/intake-api";
import type { InventorySearchItem, InventorySearchPage } from "../types";

import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";

type SearchState = CommandState & { result: InventorySearchPage | null; nothing: boolean; problem: TextProblem | null };

const INITIAL: SearchState = { ...COMMAND_IDLE, result: null, nothing: false, problem: null };

type SearchProps = {
  /** The code of the property the block binds this intake to, if any. */
  startCode: string;
  pickedId: string;
  onPick(item: InventorySearchItem): void;
};

/** The search of the owner's properties (spec 4.7); the server finds only what the confirmed account owns. */
export function InventorySearch({ startCode, pickedId, onPick }: SearchProps) {
  const t = useTranslations("InventoryIntake");
  const { leadId, wardCode, busy } = useIntake();
  const run = useIntakeCommand();
  const [propertyCode, setPropertyCode] = useState(startCode);
  const [q, setQ] = useState("");
  const codeId = useId();
  const textId = useId();

  const [state, dispatch, pending] = useActionState(async (_previous: SearchState, page: number): Promise<SearchState> => {
    const problem = searchProblem({ propertyCode, q });
    if (problem !== null) return { ...INITIAL, problem };
    const query = searchQuery({ propertyCode, q, page }, wardCode);
    if (query === null) return { ...INITIAL, nothing: true };
    let result: InventorySearchPage | null = null;
    const outcome = await run(
      () => searchInventory(leadId, query),
      (answer) => {
        result = answer;
      },
    );
    return { ...outcome, result, nothing: false, problem: null };
  }, INITIAL);
  useIntakeLock("search", pending);

  const problem = state.problem === null ? undefined : t(`text.${state.problem}`);
  // The code wins over the text, so a problem belongs to the field that would have been sent.
  const codeError = propertyCode.trim() === "" ? undefined : problem;
  const textError = propertyCode.trim() === "" ? problem : undefined;
  const page = state.result?.page ?? 0;
  const size = state.result?.size ?? 0;
  const total = state.result?.totalElements ?? 0;
  const items = state.result?.items ?? [];
  const toPage = (next: number) => startTransition(() => dispatch(next));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h3 className="text-sm font-semibold text-slate-900">{t("search.title")}</h3>
      <form action={() => dispatch(0)} noValidate className="space-y-3">
        {state.message !== null && <IntakeMessage value={state.message} />}
        <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
          <FormField id={codeId} label={t("search.propertyCode")} error={codeError}>
            <Input
              compact
              id={codeId}
              value={propertyCode}
              autoComplete="off"
              maxLength={64}
              invalid={codeError !== undefined}
              aria-describedby={describedBy(codeId, codeError)}
              onChange={(event) => setPropertyCode(event.target.value)}
            />
          </FormField>
          <FormField id={textId} label={t("search.q")} error={textError}>
            <Input
              compact
              id={textId}
              value={q}
              autoComplete="off"
              maxLength={QUERY_MAX * 2}
              invalid={textError !== undefined}
              aria-describedby={describedBy(textId, textError)}
              onChange={(event) => setQ(event.target.value)}
            />
          </FormField>
        </fieldset>
        <p className="text-xs text-slate-500">{t("search.hint")}</p>
        {state.nothing && <p className="text-sm text-rose-600">{t("search.nothingToSearch")}</p>}
        <Button type="submit" variant="secondary" pending={pending} disabled={busy}>
          {pending ? t("search.searching") : t("search.submit")}
        </Button>
      </form>
      {state.result !== null && (
        <div aria-live="polite" className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">{t("search.empty")}</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">{t("search.results", { count: total })}</p>
              <ul className="space-y-2">
                {items.map((item) => {
                  const type = labelOf(ASSET_TYPE_LABEL, item.assetType);
                  return (
                    <li key={item.propertyId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                      <span className="min-w-0 break-words">
                        <span className="font-medium text-slate-900">{item.propertyCode}</span>
                        <span className="text-slate-600">
                          {[type === null ? null : t(type), item.wardName, t("search.units", { count: item.units?.length ?? 0 })]
                            .filter(Boolean)
                            .map((text) => ` · ${text}`)}
                        </span>
                      </span>
                      {item.propertyId === pickedId ? (
                        <span className="text-sm font-semibold text-emerald-700">{t("search.picked", { code: item.propertyCode ?? "" })}</span>
                      ) : (
                        <Button variant="ghost" disabled={busy} onClick={() => onPick(item)}>
                          {t("search.pick")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {total > size && (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy || page === 0} onClick={() => toPage(page - 1)}>
                {t("search.previous")}
              </Button>
              <Button variant="secondary" disabled={busy || (page + 1) * size >= total} onClick={() => toPage(page + 1)}>
                {t("search.next")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
