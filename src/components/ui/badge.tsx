import type { ReactNode } from "react";

const tones = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-violet-200 bg-violet-50 text-violet-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

export type BadgeTone = keyof typeof tones;

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
