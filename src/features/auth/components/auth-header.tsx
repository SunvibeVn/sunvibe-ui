import { UserIcon } from "@/components/icons";

export function AuthHeader({
  title,
  description,
  centered = false,
}: {
  title: string;
  description?: string;
  /** Card style used by the log in and sign up pages: a user icon, with the title kept for screen readers only. */
  centered?: boolean;
}) {
  if (centered) {
    return (
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg shadow-orange-700/25">
          <UserIcon size={24} />
        </span>
        {/* Visible design shows only the icon; the title stays in the DOM for screen readers. */}
        <h1 className="sr-only">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>}
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>}
    </div>
  );
}
