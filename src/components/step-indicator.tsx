import { Check } from "lucide-react";
import { translate, type TranslationKey } from "@/i18n/dictionary";
import type { Language } from "@/types/domain";

const STEPS: TranslationKey[] = ["step.room", "step.select", "step.enter", "step.result"];

export function StepIndicator({ language, current }: { language: Language; current: number }) {
  return (
    <ol className="steps" aria-label={translate(language, "step.label")}>
      {STEPS.map((key, index) => {
        const number = index + 1;
        return (
          <li key={key} className={number < current ? "complete" : number === current ? "current" : ""} aria-current={number === current ? "step" : undefined}>
            <span className="step-number">{number < current ? <Check size={14} aria-hidden="true" /> : number}</span>
            <span>{translate(language, key)}</span>
          </li>
        );
      })}
    </ol>
  );
}