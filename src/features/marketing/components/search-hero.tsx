import Link from "next/link";
import type { ReactNode } from "react";
import { MapPinIcon, SearchIcon } from "@/components/icons";
import {
  propertySearchTypes,
  searchAreas,
  searchPriceMaxOptions,
  searchPriceMinOptions,
} from "../data/content";

const selectClassName =
  "search-select h-11 w-full rounded-md border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-800 outline-none transition-colors focus:border-navy-800 focus:ring-2 focus:ring-navy-800/15";

/** `prompt` goes under the search card; the page decides whether to show it (e.g. guests only). */
export function SearchHero({ prompt }: { prompt?: ReactNode }) {
  return (
    <section aria-label="Property search" className="rounded-b-2xl bg-brand-gradient text-white">
      <div className="mx-auto flex max-w-6xl flex-col px-4 pt-8 pb-8 sm:px-6 sm:pt-11 sm:pb-11 lg:px-8 lg:pt-13 lg:pb-13">
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          This is where we start
        </h1>

        <div className="mt-4 rounded-xl bg-white p-4 text-slate-900 shadow-lg sm:p-5 lg:mt-10 lg:px-5 lg:py-4">
          <form role="search" method="get" action="/" className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-4">
            <fieldset className="min-w-0 lg:flex lg:w-[8.75rem] lg:shrink-0">
              <legend className="sr-only">Property type</legend>
              <div className="flex w-full rounded-lg bg-slate-100 p-1 lg:flex-col lg:justify-center lg:gap-1 lg:bg-transparent lg:p-0">
                {propertySearchTypes.map((type, index) => (
                  <label key={type.value} className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={type.value}
                      defaultChecked={index === 0}
                      className="peer sr-only"
                    />
                    <span className="flex h-10 items-center justify-center rounded-md px-3 text-sm font-semibold text-slate-600 transition-colors peer-checked:bg-navy-950 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-navy-800 peer-focus-visible:ring-offset-2 lg:h-9">
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-end lg:gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="search-area" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Location
                </label>
                <div className="relative">
                  <MapPinIcon
                    size={18}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-600"
                  />
                  <select id="search-area" name="area" defaultValue="" className={`${selectClassName} pl-9`}>
                    <option value="" disabled>
                      Select area
                    </option>
                    {searchAreas.map((area) => (
                      <option key={area.value} value={area.value}>
                        {area.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-3 sm:w-[16.5rem] sm:shrink-0">
                <div>
                  <label htmlFor="search-price-min" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Price
                  </label>
                  <select id="search-price-min" name="minPrice" defaultValue="" className={selectClassName}>
                    <option value="">Min</option>
                    {searchPriceMinOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-price-max" className="mb-1.5 block text-sm font-medium text-transparent">
                    Max
                  </label>
                  <select
                    id="search-price-max"
                    name="maxPrice"
                    defaultValue=""
                    className={selectClassName}
                    aria-label="Maximum price"
                  >
                    <option value="">Max</option>
                    {searchPriceMaxOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-navy-950 px-8 text-sm font-semibold text-white transition-colors hover:bg-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-950 sm:w-11 sm:shrink-0 sm:px-0"
              >
                <SearchIcon size={18} />
                <span className="sm:sr-only">Search</span>
              </button>
            </div>
          </form>
        </div>

        {prompt}
      </div>
    </section>
  );
}

/** "Find the right home faster: sign up or log in", meant for visitors who are not signed in. */
export function SignUpPrompt() {
  return (
    <p className="mt-5 text-center text-sm font-medium text-white sm:text-base">
      Find the right home faster:{" "}
      <Link href="/sign-up" className="underline underline-offset-2 hover:text-white/90">
        sign up
      </Link>{" "}
      or{" "}
      <Link href="/login" className="underline underline-offset-2 hover:text-white/90">
        log in
      </Link>
    </p>
  );
}
