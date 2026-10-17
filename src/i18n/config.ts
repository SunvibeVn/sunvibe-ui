// Single locale for the whole app (D-15, C-FE-1): no locale segment or prefix in the URL.
export const locales = ["vi"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "vi";
