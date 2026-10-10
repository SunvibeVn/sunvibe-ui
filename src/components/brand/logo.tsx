import Image from "next/image";
import { siteConfig } from "@/config/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src={siteConfig.logo}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 rounded-xl shadow-md shadow-violet-600/25 ring-1 ring-navy-950/10"
      />
      <span className="text-xl font-semibold tracking-tight text-navy-950">
        {siteConfig.name}
      </span>
    </span>
  );
}
