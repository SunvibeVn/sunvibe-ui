// No locale segment or prefix in the URL (D-15, C-FE-1). Requests run in Vietnamese; only the staff workspace
// serves English through its own provider (C-41, its layout).
export const locales = ["vi", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "vi";
