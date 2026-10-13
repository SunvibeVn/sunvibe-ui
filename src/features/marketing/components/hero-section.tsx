import { ArrowRightIcon } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { heroStats } from "../data/content";
import { ProductPreview } from "./product-preview";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(139,92,246,0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-24 -z-10 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-80 w-80 rounded-full bg-orange-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:pb-28 lg:pt-28">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50/80 px-3.5 py-1.5 text-xs font-medium text-violet-700 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
            AI-native property rental platform
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-navy-950 sm:text-5xl lg:text-6xl">
            Effortless property rentals,{" "}
            <span className="bg-brand-gradient bg-clip-text text-transparent">
              powered by intelligent automation.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
            The next-generation platform for leasing apartments, houses, and
            offices. We blend real estate expertise with advanced AI to make
            renting seamless for everyone.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <a
              href={siteConfig.links.waitlist}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-700/25 transition-all hover:shadow-xl hover:shadow-orange-700/30 hover:brightness-110 sm:w-auto"
            >
              Request Early Access
              <ArrowRightIcon
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
            <a
              href="#features"
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-7 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50/50 sm:w-auto"
            >
              Explore features
            </a>
          </div>

          <dl className="mx-auto mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-slate-200 pt-8 lg:mx-0">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-2xl font-semibold text-slate-900">
                  {stat.value}
                </dd>
                <dd className="mt-1 text-xs text-slate-500 sm:text-sm">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}
