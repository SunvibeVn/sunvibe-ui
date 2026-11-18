import { Button } from "@/components/ui/button";

export type SiteErrorTexts = { title: string; message: string; retry: string; home: string };

/**
 * The body of an error page in one language (marketing-landing SV-250): a retry through Next's `retry` and a full page
 * load of the home page. It never shows the thrown error. It holds a click handler, so only client modules import it.
 */
export function SiteErrorPanel({ texts, retry, lang }: { texts: SiteErrorTexts; retry: () => void; lang: "vi" | "en" }) {
  return (
    <div lang={lang} className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">{texts.title}</h1>
        <p className="text-base text-slate-600">{texts.message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={retry}>{texts.retry}</Button>
        {/* A full page load after an error, not a client navigation (marketing-landing SV-250). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-violet-700 transition-all hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          {texts.home}
        </a>
      </div>
    </div>
  );
}
