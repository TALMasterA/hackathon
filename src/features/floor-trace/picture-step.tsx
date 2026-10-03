"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import type { Language } from "@/types/domain";
import { canvasUrl, PLAN_FILE_TYPES, type PdfPlan, type SourceErrorCode } from "./plan-source";
import type { TraceSourceInfo } from "./trace-state";

const THUMBNAIL_SIDE = 220;

/** Page thumbnails of a multi-page PDF, rendered one after another and released on change. */
function usePageThumbnails(pdf: PdfPlan | null): (string | null)[] {
  const [thumbnails, setThumbnails] = useState<{ pdf: PdfPlan | null; urls: (string | null)[] }>({ pdf: null, urls: [] });
  useEffect(() => {
    if (!pdf || pdf.pageCount < 2) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (let page = 1; page <= pdf.pageCount && !cancelled; page++) {
        const url = await canvasUrl(await pdf.thumbnail(page, THUMBNAIL_SIDE)).catch(() => null);
        if (!url) continue;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        urls.push(url);
        setThumbnails((previous) => {
          const next = previous.pdf === pdf ? [...previous.urls] : Array<string | null>(pdf.pageCount).fill(null);
          next[page - 1] = url;
          return { pdf, urls: next };
        });
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pdf]);
  return thumbnails.pdf === pdf ? thumbnails.urls : [];
}

interface PictureStepProps {
  language: Language;
  loading: boolean;
  error: SourceErrorCode | null;
  pdf: PdfPlan | null;
  source: TraceSourceInfo | null;
  onFile: (file: File) => void;
  onPage: (page: number) => void;
}

export function PictureStep({ language, loading, error, pdf, source, onFile, onPage }: PictureStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const input = useRef<HTMLInputElement>(null);
  const thumbnails = usePageThumbnails(pdf);
  return (
    <section className="trace-picture" aria-labelledby="trace-picture-title">
      <h2 id="trace-picture-title">{t("picture.title")}</h2>
      <p>{t("picture.intro")}</p>
      <button type="button" className="primary-button trace-choose" disabled={loading} onClick={() => input.current?.click()}><FileUp size={18} aria-hidden="true" />{t("picture.choose")}</button>
      <input ref={input} type="file" accept={PLAN_FILE_TYPES} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
      <p className="constraint-note">{t("picture.private")}</p>
      {loading && <p className="trace-status" role="status"><LoaderCircle className="loading-icon" size={17} aria-hidden="true" />{t("picture.loading")}</p>}
      {error && <p className="field-error" role="alert">{t(`picture.error.${error}`)}</p>}
      {source && <p className="trace-status">{t("picture.current", { name: source.name, page: source.page, count: source.pageCount })}</p>}
      {pdf && pdf.pageCount > 1 && (
        <>
          <p>{t("picture.pages", { count: pdf.pageCount })}</p>
          <ul className="trace-pages">
            {Array.from({ length: pdf.pageCount }, (_, index) => index + 1).map((page) => (
              <li key={page}>
                <button type="button" aria-pressed={source?.page === page && source.name === pdf.name} disabled={loading} onClick={() => onPage(page)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of a page rendered in this browser */}
                  {thumbnails[page - 1] ? <img src={thumbnails[page - 1]!} alt="" /> : <span className="trace-page-placeholder"><LoaderCircle className="loading-icon" size={18} aria-hidden="true" /></span>}
                  <span>{t("picture.page", { page })}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
