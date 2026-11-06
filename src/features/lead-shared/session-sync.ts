// Public entry for the root layout (Client Component API): ONLY `DraftSessionSync`. The root layout is in the entry
// chunk of every page, so it must not import the barrels (index.ts, client.ts), which would carry the staff code to
// public visitors.
export { DraftSessionSync } from "./components/draft-session-sync";
