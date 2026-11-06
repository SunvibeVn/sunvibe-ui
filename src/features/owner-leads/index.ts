// Public entry point for Server Components (pages and layouts). Staff data is never read on the server: the views are
// "use client" modules (the server renders only their shell; they load data in the browser). Nothing outside the
// feature imports a Client Component API from it.
export { LeadDetailView } from "./components/lead-detail-view";
export { LeadListView } from "./components/lead-list-view";
export { LeadSurveyContext } from "./components/lead-survey-context";
export { TerritoriesView } from "./components/territories-view";
