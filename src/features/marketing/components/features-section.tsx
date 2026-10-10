import { features } from "../data/content";

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-600">
            AI at the core
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Renting, reimagined with intelligent automation
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
            Sunvibe replaces slow, manual leasing with AI that matches,
            automates, and responds, so landlords and tenants can focus on what
            matters.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-600/10 sm:p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-50 to-cyan-50 text-violet-600 ring-1 ring-violet-200/60 transition-colors group-hover:bg-brand-gradient group-hover:text-white group-hover:ring-transparent">
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
  );
}
