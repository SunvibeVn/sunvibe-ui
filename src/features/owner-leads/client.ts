// Public entry for the root layout (Client Component API): ONLY `DraftSessionSync`. The root layout is in the entry
// chunk of every page, so it must not import the barrel (index.ts), which would carry the staff views, dialogs and
// services to public visitors.
export { DraftSessionSync } from "./components/draft-session-sync";
