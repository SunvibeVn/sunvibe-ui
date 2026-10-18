import Link from "next/link";

export type TabItem = {
  href: string;
  label: string;
  current: boolean;
};

type TabsProps = {
  items: TabItem[];
  /** Accessible name of the navigation landmark. */
  label: string;
};

export function Tabs({ items, label }: TabsProps) {
  return (
    <nav aria-label={label}>
      <ul className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-200">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              prefetch={false}
              aria-current={item.current ? "page" : undefined}
              className={`block border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600 ${
                item.current
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
