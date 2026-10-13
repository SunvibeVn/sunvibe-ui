"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AUTH_ROUTES } from "../constants";

const MODES = {
  [AUTH_ROUTES.login]: {
    title: "WELCOME!",
    text: "Log in or create a new account to enjoy a safe, simple experience.",
  },
  [AUTH_ROUTES.signUp]: {
    title: "GET STARTED!",
    text: "Create your account in a few simple steps and start renting with AI.",
  },
} as const;

type Mode = keyof typeof MODES;

/** The mode of the current page; the sign-up steps (`/sign-up/verify`, ...) count as sign-up. */
function useMode(): Mode | undefined {
  const pathname = usePathname();
  return (Object.keys(MODES) as Mode[]).find((mode) => pathname === mode || pathname.startsWith(`${mode}/`));
}

/** Title and copy in the brand panel. Falls back to a generic welcome on other auth pages. */
export function AuthPanelCopy() {
  const mode = useMode();
  const copy = mode ? MODES[mode] : { title: "WELCOME!", text: "Your AI-powered rental assistant." };

  return (
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{copy.title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/90">{copy.text}</p>
    </div>
  );
}

/** Log in / Sign up toggle. Renders nothing on auth pages that are not a login or sign-up page. */
export function AuthModeSwitch({ className = "" }: { className?: string }) {
  const mode = useMode();
  if (!mode) return null;

  const items = [
    { href: AUTH_ROUTES.login, label: "LOG IN", value: AUTH_ROUTES.login },
    { href: AUTH_ROUTES.signUp, label: "SIGN UP", value: AUTH_ROUTES.signUp },
  ];

  return (
    <nav aria-label="Choose log in or sign up" className={`gap-1 rounded-2xl bg-navy-950 p-1.5 shadow-xl ${className}`}>
      {items.map((item) => {
        const active = item.value === mode;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-4 py-2.5 text-center text-xs font-bold tracking-wider transition-colors ${
              active ? "bg-brand-gradient text-white shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
