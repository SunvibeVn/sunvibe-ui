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
  /** Long text (a confirmation cause, a flag) wraps inside its container instead of overflowing a phone screen. */
  wrap?: boolean;
  children: ReactNode;
};

export function Badge({ tone = "neutral", wrap = false, children }: BadgeProps) {
  const shape = wrap ? "max-w-full whitespace-normal rounded-xl text-left" : "whitespace-nowrap rounded-full";
  return (
    <span className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold ${shape} ${tones[tone]}`}>
      {children}
    </span>
  );
}
