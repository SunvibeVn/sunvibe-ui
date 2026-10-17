/** Box styling shared by Input and Select. Font size stays 16px on phones: iOS Safari zooms smaller inputs. */
export function controlClass({ invalid = false, compact = false }: { invalid?: boolean; compact?: boolean } = {}) {
  return `block w-full border bg-white text-base text-slate-900 sm:text-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
    compact ? "rounded-lg px-3 py-2" : "rounded-xl px-4 py-3 shadow-sm"
  } ${
    invalid
      ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
      : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
  }`;
}
