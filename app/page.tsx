import type { ReactNode } from "react";

const CONTACT_EMAIL = "admin@sunvibe.vn";
const WAITLIST_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Sunvibe Early Access Request",
)}`;

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const features: Feature[] = [
  {
    title: "AI-Powered Matchmaking",
    description:
      "Our intelligent algorithms instantly connect landlords with the ideal tenants by analyzing preferences, behavioral patterns, and real-time market data.",
    icon: (
      <svg {...iconProps}>
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
      </svg>
    ),
  },
  {
    title: "Intelligent Workflow Automation",
    description:
      "Say goodbye to manual paperwork. Automate lease agreements, background checks, and rent tracking with our secure, agentic workflows.",
    icon: (
      <svg {...iconProps}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
        <path d="M14 2v6h6" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "24/7 Virtual Leasing Assistant",
    description:
      "Never miss a lead. Our conversational AI assistant handles inquiries, qualifies prospects, and schedules property viewings around the clock.",
    icon: (
      <svg {...iconProps}>
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        <path d="M8 12h.01" />
        <path d="M12 12h.01" />
        <path d="M16 12h.01" />
      </svg>
    ),
  },
];

function SunvibeLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-orange-500/30">
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </span>
      <span className="text-xl font-semibold tracking-tight text-slate-900">
        Sunvibe
      </span>
    </span>
  );
}

function ArrowRight() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="transition-transform group-hover:translate-x-0.5"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-amber-200/60 via-orange-100/40 to-indigo-200/60 blur-2xl" />
      <div className="relative rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-700">
              Sunvibe AI is matching
            </span>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            Live
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Listing
          </p>
          <p className="mt-1 font-semibold text-slate-900">
            2BR Apartment · District 2, HCMC
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            Furnished · River view · Available Nov 1
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {[
            { name: "Linh N.", note: "Remote worker, 12-mo lease", score: 97 },
            { name: "David K.", note: "Relocating family of 3", score: 91 },
            { name: "Mai T.", note: "Graduate student, pet-free", score: 84 },
          ].map((tenant) => (
            <li
              key={tenant.name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-amber-100 text-sm font-semibold text-slate-700">
                  {tenant.name[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {tenant.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {tenant.note}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                {tenant.score}% match
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-900 p-4 text-sm text-slate-100">
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="mt-0.5 shrink-0 text-amber-400"
          >
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
          </svg>
          <p>
            Viewing scheduled with Linh for Sat, 10:00 AM. Lease draft and
            background check started automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" aria-label="Sunvibe home">
            <SunvibeLogo />
          </a>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
            >
              Features
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
            >
              Contact
            </a>
            <a
              href={WAITLIST_HREF}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              Get early access
            </a>
          </div>
        </nav>
      </header>

      <main id="top" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(251,191,36,0.22),transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 top-24 -z-10 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          />

          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:pb-28 lg:pt-28">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50/80 px-3.5 py-1.5 text-xs font-medium text-orange-700 sm:text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                AI-native property rental platform
              </span>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Effortless property rentals,{" "}
                <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
                  powered by intelligent automation.
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
                The next-generation platform for leasing apartments, houses,
                and offices. We blend real estate expertise with advanced AI to
                make renting seamless for everyone.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <a
                  href={WAITLIST_HREF}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/30 hover:brightness-105 sm:w-auto"
                >
                  Request Early Access
                  <ArrowRight />
                </a>
                <a
                  href="#features"
                  className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-7 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                >
                  Explore features
                </a>
              </div>

              <dl className="mx-auto mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-slate-200 pt-8 lg:mx-0">
                {[
                  { value: "24/7", label: "AI assistant" },
                  { value: "3", label: "Property types" },
                  { value: "100%", label: "Digital leasing" },
                ].map((stat) => (
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

        {/* AI Features */}
        <section
          id="features"
          className="scroll-mt-20 border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
                AI at the core
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Renting, reimagined with intelligent automation
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
                Sunvibe replaces slow, manual leasing with AI that matches,
                automates, and responds, so landlords and tenants can focus on
                what matters.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="group relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-xl hover:shadow-orange-500/5 sm:p-8"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/60 transition-colors group-hover:from-amber-400 group-hover:to-orange-500 group-hover:text-white">
                    {feature.icon}
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center shadow-2xl sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(249,115,22,0.35),transparent_70%)]"
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
                href={WAITLIST_HREF}
                className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-slate-900 shadow-lg transition-colors hover:bg-amber-50"
              >
                Join the Waitlist
                <ArrowRight />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:px-6 md:flex-row lg:px-8">
          <div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
            <SunvibeLogo className="scale-90" />
            <p>© 2026 SunVibe</p>
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-slate-600 transition-colors hover:text-orange-600"
          >
            Contact us: {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}
