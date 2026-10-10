import { mailto } from "@/lib/utils/mailto";
import { siteConfig } from "./site";

export type NavLink = { label: string; href: string };
export type NavGroup = { title: string; links: NavLink[] };

const ask = (subject: string) => mailto(siteConfig.contactEmail, subject);

export const headerNav: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "Contact", href: siteConfig.links.contact },
];

export const footerNav: NavGroup[] = [
  {
    title: "Platform",
    links: [
      { label: "AI Matchmaking", href: "/#features" },
      { label: "Workflow Automation", href: "/#features" },
      { label: "Virtual Leasing Assistant", href: "/#features" },
      { label: "Early Access", href: siteConfig.links.waitlist },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "For Landlords", href: ask("Sunvibe for Landlords") },
      { label: "For Tenants", href: ask("Sunvibe for Tenants") },
      { label: "Apartments & Houses", href: ask("Residential Leasing Inquiry") },
      { label: "Office Spaces", href: ask("Office Leasing Inquiry") },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: siteConfig.links.contact },
      { label: "Partnerships", href: ask("Partnership Inquiry") },
      { label: "Press & Media", href: ask("Press Inquiry") },
      { label: "Investors", href: ask("Investor Inquiry") },
    ],
  },
];
