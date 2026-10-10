import type { ReactNode } from "react";

const tones = {
  error: "border-rose-200 bg-rose-50 text-rose-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-violet-200 bg-violet-50 text-violet-900",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}
