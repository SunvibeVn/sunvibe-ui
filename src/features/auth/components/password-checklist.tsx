import { CheckIcon, CircleIcon } from "@/components/icons";
import { PASSWORD_RULES } from "../schemas/auth.schema";

/** Live list of the password rules; ticks each rule the current value meets. */
export function PasswordChecklist({ id, value }: { id: string; value: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${met ? "text-emerald-700" : "text-slate-500"}`}>
            {met ? <CheckIcon size={14} strokeWidth={3} /> : <CircleIcon size={14} />}
            <span>
              {rule.label}
              <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
