"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { Input, type InputProps } from "./input";

export function PasswordInput(props: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-violet-600"
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
