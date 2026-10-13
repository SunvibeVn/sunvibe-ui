import { SparkleIcon } from "@/components/icons";
import { previewListing, previewMatches } from "../data/content";

export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-orange-200/60 via-violet-200/50 to-cyan-200/60 blur-2xl" />
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
            {previewListing.title}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {previewListing.details}
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {previewMatches.map((tenant) => (
            <li
              key={tenant.name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-cyan-100 text-sm font-semibold text-navy-900">
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
              <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                {tenant.score}% match
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-gradient p-4 text-sm text-white">
          <SparkleIcon size={18} className="mt-0.5 shrink-0 text-amber-100" />
          <p>
            Viewing scheduled with Linh for Sat, 10:00 AM. Lease draft and
            background check started automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
