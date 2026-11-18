import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export type NotFoundTexts = { title: string; message: string; home: string };

/** The body of the site's 404 page in one language (marketing-landing SV-250). */
export function NotFoundPanel({ texts, lang }: { texts: NotFoundTexts; lang: "vi" | "en" }) {
  return (
    <div lang={lang} className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <Logo />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">{texts.title}</h1>
        <p className="text-base text-slate-600">{texts.message}</p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-700/25 transition-all hover:shadow-xl hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        {texts.home}
      </Link>
    </div>
  );
}
