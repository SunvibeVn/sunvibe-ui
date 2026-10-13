import Image from "next/image";
import { siteConfig } from "@/config/site";

export function Logo({
  className = "",
  tone = "dark",
  size = "md",
}: {
  className?: string;
  tone?: "dark" | "light";
  size?: "md" | "lg";
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src={tone === "light" ? "/images/brand/sunvibe-logo-transparent.png" : siteConfig.logo}
        alt=""
        width={36}
        height={36}
        className={
          tone === "light"
            ? size === "lg"
              ? "h-[2.3625rem] w-auto"
              : "h-9 w-auto"
            : "h-9 w-9 rounded-xl shadow-md shadow-violet-600/25 ring-1 ring-navy-950/10"
        }
      />
      <span className={`${size === "lg" ? "text-[1.3125rem]" : "text-xl"} font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-navy-950"}`}>
        {siteConfig.name}
      </span>
    </span>
  );
}
