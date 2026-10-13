import { Logo } from "@/components/brand/logo";
import { ArrowRightIcon, ArrowUpIcon, MailIcon } from "@/components/icons";
import { footerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { BackToTop } from "./back-to-top";

const footerTags = ["AI Matchmaking", "Agentic Workflows", "24/7 Assistant"];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 py-14 sm:py-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <Logo />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-600">
              Sunvibe is an AI-native platform for leasing apartments, houses,
              and offices, combining real estate expertise with intelligent
              automation to make renting seamless for landlords and tenants.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {footerTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
            <a
              href={siteConfig.links.waitlist}
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
            >
              Request Early Access
              <ArrowRightIcon
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {footerNav.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-slate-900">
                  {group.title}
                </h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-slate-600 transition-colors hover:text-violet-700"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 py-6 text-sm text-slate-500 md:flex-row">
          <p>© 2026 {siteConfig.legalName}</p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <a
              href={siteConfig.links.contact}
              className="inline-flex items-center gap-2 font-medium text-slate-700 transition-colors hover:text-violet-700"
            >
              <MailIcon size={16} />
              Contact us: {siteConfig.contactEmail}
            </a>
            <BackToTop
              className="group inline-flex items-center gap-1.5 rounded-full bg-navy-950 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-navy-800"
            >
              Back to top
              <ArrowUpIcon
                size={14}
                className="transition-transform group-hover:-translate-y-0.5"
              />
            </BackToTop>
          </div>
        </div>
      </div>
    </footer>
  );
}
