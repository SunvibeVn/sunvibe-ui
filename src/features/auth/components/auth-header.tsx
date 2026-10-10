export function AuthHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>
    </div>
  );
}
