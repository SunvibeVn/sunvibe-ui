"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { Input, type InputProps } from "./input";

export function PasswordInput({ compact = false, ...props }: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} compact={compact} type={visible ? "text" : "password"} className={compact ? "pr-10" : "pr-12"} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className={`absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-violet-600 ${
          compact ? "w-10 rounded-r-lg" : "w-12 rounded-r-xl"
        }`}
      >
        {visible ? <EyeOffIcon size={compact ? 16 : 18} /> : <EyeIcon size={compact ? 16 : 18} />}
      </button>
    </div>
  );
}
