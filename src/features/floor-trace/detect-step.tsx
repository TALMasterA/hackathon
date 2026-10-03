"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, PencilRuler, RotateCcw, Send, X } from "lucide-react";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import type { Language } from "@/types/domain";
import type { ReadErrorCode } from "./floorplan-client";

interface DetectStepProps {
  language: Language;
  /** Object URL of the exact picture that would be sent; null while it is being prepared. */
  picture: string | null;
  /** When the reading started (ms), while it runs. */
  readingSince: number | null;
  error: ReadErrorCode | null;
  onConfirm: () => void;
  onCancel: () => void;
  onManual: () => void;
}

/** Elapsed whole seconds since a start time, updated every second while running. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}

/** Consent with the exact picture, then progress with Cancel, then an error with both ways onward. */
export function DetectStep({ language, picture, readingSince, error, onConfirm, onCancel, onManual }: DetectStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const seconds = useElapsed(readingSince);
  const reading = readingSince !== null;
  return (
    <section className="trace-picture trace-detect" aria-labelledby="trace-detect-title">
      <h2 id="trace-detect-title">{t("detect.title")}</h2>
      {picture ? (
        <figure className="trace-detect-picture">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the picture prepared in this browser */}
          <img src={picture} alt={t("detect.picture")} />
          <figcaption>{t("detect.picture")}</figcaption>
        </figure>
      ) : <p className="trace-status" role="status"><LoaderCircle className="loading-icon" size={17} aria-hidden="true" />{t("detect.preparing")}</p>}
      <p className="look-consent">{t("detect.consent")}</p>
      {reading && <p className="trace-status" role="status"><LoaderCircle className="loading-icon" size={17} aria-hidden="true" />{t("detect.reading", { seconds })}</p>}
      {error && !reading && <p className={error === "cancelled" ? "trace-status" : "field-error"} role={error === "cancelled" ? "status" : "alert"}>{t(`detect.error.${error}`)}</p>}
      <div className="trace-actions">
        {reading ? (
          <button type="button" className="secondary-button" onClick={onCancel}><X size={17} aria-hidden="true" />{t("detect.cancel")}</button>
        ) : (
          <>
            <button type="button" className="primary-button" disabled={!picture || error === "disabled"} onClick={onConfirm}>{error && error !== "cancelled" ? <RotateCcw size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}{t(error && error !== "cancelled" ? "detect.retry" : "detect.confirm")}</button>
            <button type="button" className="secondary-button" onClick={onManual}><PencilRuler size={17} aria-hidden="true" />{t("detect.manual")}</button>
          </>
        )}
      </div>
    </section>
  );
}
