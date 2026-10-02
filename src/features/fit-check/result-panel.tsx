import { CircleCheck, CircleDashed, CircleX, Info } from "lucide-react";
import { translate, type TranslationKey } from "@/i18n/dictionary";
import { correctionMessages, inputMessage, violationMessage } from "@/i18n/messages";
import type { FitResult, Language } from "@/types/domain";

export function ResultPanel({ language, result, dirty }: { language: Language; result: FitResult | null; dirty: boolean }) {
  const text = (key: TranslationKey) => translate(language, key);
  const status = result?.status ?? (dirty ? "dirty" : "idle");
  const Icon = status === "valid" ? CircleCheck : status === "invalid" ? CircleX : status === "incomplete" ? Info : CircleDashed;
  const titleKey: TranslationKey = `result.${status}Title`;
  const bodyKey: TranslationKey = `result.${status}Body`;
  return (
    <section className={`result-panel result-${status}`} data-testid="result-panel" data-status={status} aria-live="polite" aria-atomic="true" aria-labelledby="result-title">
      <div className="result-heading"><Icon size={23} aria-hidden="true" /><h2 id="result-title">{text(titleKey)}</h2></div>
      <p className="result-summary">{text(bodyKey)}</p>
      {result?.status === "incomplete" && <ul className="violation-list">{result.issues.map((issue) => <li key={issue.field}>{inputMessage(issue, language)}</li>)}</ul>}
      {result && result.status !== "incomplete" && (
        <>
          <h3 className="small-heading">{text("result.checks")}</h3>
          <ul className="check-list">
            {result.checks.map((check) => (
              <li key={check.code} className={check.passed ? "check-passed" : "check-failed"}>
                {check.passed ? <CircleCheck size={17} aria-hidden="true" /> : <CircleX size={17} aria-hidden="true" />}
                <div><strong>{text(`check.${check.code}`)}</strong>{check.passed && <p>{text(`check.${check.code}.passed`)}</p>}</div>
                <span>{text(check.passed ? "result.passed" : "result.failed")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {result?.status === "invalid" && (
        <>
          <h3 className="small-heading">{text("result.issues")}</h3>
          <ul className="violation-list">{result.violations.map((violation, index) => <li key={`${violation.code}-${index}`}>{violationMessage(violation, language)}</li>)}</ul>
          <h3 className="small-heading">{text("result.suggestions")}</h3>
          <ul className="suggestion-list">{correctionMessages(result, language).map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
        </>
      )}
      {result && <p className="result-caution"><Info size={15} aria-hidden="true" />{text("result.caution")}</p>}
    </section>
  );
}