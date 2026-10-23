/** `navigator.clipboard` exists in secure contexts only. */
export type ClipboardWriter = { writeText: (text: string) => Promise<void> };

/** Copies the text; a refused or missing clipboard is not fatal, the text stays on screen to copy by hand. */
export async function copyText(text: string, clipboard: ClipboardWriter | undefined): Promise<"copied" | "failed"> {
  if (!clipboard) return "failed";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
