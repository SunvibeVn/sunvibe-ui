/** Placeholder while a form waits for request data (search params, session). */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="space-y-5" aria-hidden>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ))}
      <div className="h-12 animate-pulse rounded-full bg-slate-100" />
    </div>
  );
}
