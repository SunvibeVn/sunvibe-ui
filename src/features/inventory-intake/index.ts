// Public entry for Server Components (workspace pages) and for the lead detail. Staff data is read only in the browser.
// The owner flow of the account page is kept off this barrel: its public entry is client.ts.
export { IntakePage } from "./components/intake-page";
export { IntakeSection } from "./components/intake-section";
export { CaseDetailView } from "./components/case-detail";
export { CaseListView } from "./components/case-list-view";
