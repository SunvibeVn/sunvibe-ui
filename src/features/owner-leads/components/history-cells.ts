/**
 * Classes of the history table, shared by its read-only rows and the new row. From `xl` it is a table; below, every
 * row is a card whose cells stack, each led by its column name (`data-label`), so a phone needs no sideways scroll.
 */
export const HISTORY_ROW = "border-t border-slate-100 max-xl:block max-xl:py-3";

export const HISTORY_CELL =
  "px-3 py-3 align-top text-slate-800 max-xl:flex max-xl:items-start max-xl:gap-3 max-xl:px-0 max-xl:py-1 max-xl:before:w-20 max-xl:before:shrink-0 max-xl:before:pt-0.5 max-xl:before:text-xs max-xl:before:font-semibold max-xl:before:uppercase max-xl:before:tracking-wide max-xl:before:text-slate-500 max-xl:before:content-[attr(data-label)]";
