"use client";

import { useRef, useState } from "react";
import { sanitizeOtp } from "./sanitize-otp";

type OtpInputProps = {
  /** Applied to the first box so a <label htmlFor> points at it. */
  id: string;
  /** Name of the hidden input that carries the full code. */
  name: string;
  label: string;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
};

/** One box per digit; supports typing, paste, SMS autofill, backspace and arrow keys. */
export function OtpInput({ id, name, label, length = 6, invalid, autoFocus, describedBy }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (index: number) => boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const fillFrom = (start: number, value: string) => {
    const chars = sanitizeOtp(value, length - start).split("");
    if (chars.length === 0) return;
    setDigits((previous) => {
      const next = [...previous];
      chars.forEach((char, offset) => {
        next[start + offset] = char;
      });
      return next;
    });
    focusBox(start + chars.length);
  };

  const clear = (index: number) =>
    setDigits((previous) => previous.map((digit, i) => (i === index ? "" : digit)));

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-between gap-2 sm:gap-3">
      <input type="hidden" name={name} value={digits.join("")} />
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          id={index === 0 ? id : undefined}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            if (event.target.value === "") clear(index);
            else fillFrom(index, event.target.value.slice(digit ? 1 : 0) || event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) {
              event.preventDefault();
              clear(index - 1);
              focusBox(index - 1);
            } else if (event.key === "ArrowLeft") {
              focusBox(index - 1);
            } else if (event.key === "ArrowRight") {
              focusBox(index + 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            fillFrom(index, event.clipboardData.getData("text"));
          }}
          className={`h-12 w-full min-w-0 rounded-xl border bg-white text-center text-lg font-semibold text-navy-950 shadow-sm transition-colors focus:outline-none focus:ring-4 sm:h-14 ${
            invalid
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
          }`}
        />
      ))}
    </div>
  );
}
