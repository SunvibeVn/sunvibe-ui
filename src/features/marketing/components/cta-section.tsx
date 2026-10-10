import { ArrowRightIcon } from "@/components/icons";
import { siteConfig } from "@/config/site";

export function CtaSection() {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-navy-950 px-6 py-14 text-center shadow-2xl sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_20%_120%,rgba(249,115,22,0.35),transparent_70%),radial-gradient(ellipse_50%_80%_at_80%_120%,rgba(34,211,238,0.3),transparent_70%),radial-gradient(ellipse_60%_70%_at_50%_-20%,rgba(139,92,246,0.35),transparent_70%)]"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Be among the first to rent smarter with Sunvibe
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Join our early access program and help shape the future of
            AI-powered property leasing.
          </p>
          <a
            href={siteConfig.links.waitlist}
            className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-navy-950 shadow-lg transition-colors hover:bg-violet-50"
          >
            Join the Waitlist
            <ArrowRightIcon
              size={18}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
