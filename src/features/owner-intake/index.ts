// Public entry point for Server Components (pages and layouts). Client Components use "@/features/owner-intake/client".
export { OwnerIntakeForm } from "./components/owner-intake-form";
export { isOwnerIntakeEnabled } from "./lib/feature-flag";
export type { CatalogResult, CatalogSelectionChange, Province, Ward, WardType } from "./types/catalog";
