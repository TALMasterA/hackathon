"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { X } from "lucide-react";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { traceFromAi } from "@/lib/floorplan/ai-trace";
import { fittedScale, wholeSource } from "@/lib/floorplan/frames";
import type { Box } from "@/lib/geometry/architecture";
import { isFlatType, type TracePlan } from "@/lib/floorplan/trace";
import type { Flat, Language } from "@/types/domain";
import { analysePlan, findScale, releaseAnalysis, type PlanAnalysis } from "./analysis";
import { CheckStep } from "./check-step";
import { DetectStep } from "./detect-step";
import { aiPicture, boxInRaster, readPlanWithAi, ReadError, type ReadErrorCode } from "./floorplan-client";
import { PictureStep } from "./picture-step";
import { canvasUrl, isPdf, isPlanImage, openImage, openPdf, SourceError, type PdfPlan, type PlanSource, type SourceErrorCode } from "./plan-source";
import { ReviewStep } from "./review-step";
import { ScaleStep } from "./scale-step";
import { canEnter, createTraceState, scaleOf, traceReducer, type TraceStep } from "./trace-state";
import { UnitStep } from "./unit-step";

export interface TraceScreenProps {
  language: Language;
  /** Whether the server offers AI reading; without it the flow is trace-by-hand only. */
  aiAvailable?: boolean;
  /** Whether using a flat discards furniture or history in the editor, so the last step warns. */
  needsConfirm: boolean;
  onCancel: () => void;
  onUse: (flat: Flat) => void;
}

const TABS: readonly Exclude<TraceStep, "detect">[] = ["picture", "scale", "unit", "review", "check"];
/** The overview is sharp enough to find the scale bar and the flat; precise work uses sharp crops. */
const OVERVIEW_SIDE = 4096;
const EMPTY_PLAN: TracePlan = { rooms: [], openPairs: [], doors: [], windows: [] };

/** The whole trace flow; everything stays in the browser until the user confirms sending a crop to the AI. */
export default function TraceScreen({ language, aiAvailable = true, needsConfirm, onCancel, onUse }: TraceScreenProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const [state, dispatch] = useReducer(traceReducer, undefined, createTraceState);
  const [pdf, setPdf] = useState<PdfPlan | null>(null);
  const [source, setSource] = useState<PlanSource | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PlanAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SourceErrorCode | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [aiJob, setAiJob] = useState<{ picture: Blob; url: string; bounds: Box } | null>(null);
  const [readingSince, setReadingSince] = useState<number | null>(null);
  const [readError, setReadError] = useState<ReadErrorCode | null>(null);
  const reading = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => pdf?.close(), [pdf]);
  useEffect(() => () => { if (overview) URL.revokeObjectURL(overview); }, [overview]);
  useEffect(() => () => releaseAnalysis(analysis), [analysis]);
  useEffect(() => () => { if (aiJob) URL.revokeObjectURL(aiJob.url); }, [aiJob]);
  useEffect(() => () => reading.current?.abort(), []);
  useEffect(() => heading.current?.focus(), []);

  async function openSource(next: PlanSource, page: number, pageCount: number) {
    const canvas = await next.render(wholeSource(next), fittedScale(next, OVERVIEW_SIDE / Math.max(next.width, next.height)));
    setOverview(await canvasUrl(canvas));
    setSource(next);
    setAnalysis(null);
    dispatch({ type: "source", source: { name: next.name, kind: next.kind, page, pageCount } });
    const found = next.kind === "pdf" ? await findScale(next).catch(() => null) : null;
    if (found) dispatch({ type: "scale-found", points: found.points, lengthCm: found.lengthCm });
  }

  async function run(task: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(failure instanceof SourceError ? failure.code : "unreadable");
    } finally {
      setLoading(false);
    }
  }

  function chooseFile(file: File) {
    // A new file replaces everything, so nothing from a closed PDF can still be shown.
    setSource(null);
    setOverview(null);
    setAnalysis(null);
    dispatch({ type: "reset" });
    void run(async () => {
      if (isPdf(file)) {
        const opened = await openPdf(file);
        setPdf(opened);
        if (opened.pageCount === 1) await openSource(await opened.source(1), 1, 1);
      } else if (isPlanImage(file)) {
        setPdf(null);
        await openSource(await openImage(file), 1, 1);
      } else throw new SourceError("unsupported");
    });
  }

  function choosePage(page: number) {
    if (pdf) void run(async () => openSource(await pdf.source(page), page, pdf.pageCount));
  }

  /** Renders the sharp crop of the user's flat, then starts the review with the given plan. */
  async function prepare(): Promise<PlanAnalysis | null> {
    const cmPerUnit = scaleOf(state.scale);
    if (!source || !state.unit.box || cmPerUnit === null) return null;
    setPreparing(true);
    setPrepareFailed(false);
    try {
      const next = await analysePlan(source, state.unit.box, state.unit.rotation, cmPerUnit);
      setAnalysis(next);
      return next;
    } catch {
      setPrepareFailed(true);
      return null;
    } finally {
      setPreparing(false);
    }
  }

  async function traceByHand() {
    reading.current?.abort();
    if (await prepare()) dispatch({ type: "start", plan: EMPTY_PLAN, readBy: "manual" });
  }

  /** Prepares the crop and the exact picture for the AI, then asks for consent before anything is sent. */
  async function askAi() {
    setReadError(null);
    setAiJob(null);
    const prepared = await prepare();
    if (!prepared || !state.unit.box) return;
    dispatch({ type: "step", step: "detect" });
    const { corners, bounds } = boxInRaster(state.unit.box, prepared.frame, prepared.pxPerUnit);
    try {
      const picture = await aiPicture(prepared.canvas, corners);
      setAiJob({ picture, url: URL.createObjectURL(picture), bounds });
    } catch (error) {
      setReadError(error instanceof ReadError ? error.code : "invalid-picture");
    }
  }

  async function readWithAi() {
    if (!aiJob || !analysis) return;
    const controller = new AbortController();
    reading.current = controller;
    setReadError(null);
    setReadingSince(Date.now());
    try {
      const result = await readPlanWithAi(aiJob.picture, state.unit.flatType, { signal: controller.signal });
      const trace = traceFromAi(analysis.context, result.plan, analysis.canvas, aiJob.bounds);
      if (!state.unit.flatType && trace.label && isFlatType(trace.label)) dispatch({ type: "flat-type", flatType: trace.label });
      dispatch({ type: "start", plan: trace.plan, readBy: "ai", model: result.model, notes: { outside: trace.outside, dropped: result.dropped + trace.strayDoors, diagonal: trace.diagonal, repaired: result.repaired } });
    } catch (error) {
      setReadError(error instanceof ReadError ? error.code : "network");
    } finally {
      setReadingSince(null);
      reading.current = null;
    }
  }

  const current: Exclude<TraceStep, "detect"> = state.step === "detect" ? "unit" : state.step;
  return (
    <section className="trace-screen" aria-labelledby="trace-title">
      <div className="trace-header">
        <h1 id="trace-title" ref={heading} tabIndex={-1}>{t("trace.title")}</h1>
        <nav aria-label={t("trace.steps")}>
          <ol className="trace-steps">
            {TABS.map((step, index) => (
              <li key={step}>
                <button type="button" aria-current={current === step ? "step" : undefined} disabled={!canEnter(state, step) || (step === "review" && !analysis)} onClick={() => dispatch({ type: "step", step })}>
                  <span className="step-number">{index + 1}</span>{t(`trace.step.${step}`)}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <button type="button" className="quiet-button" onClick={onCancel}><X size={17} aria-hidden="true" />{t("trace.cancel")}</button>
      </div>
      {current === "picture" && <PictureStep language={language} loading={loading} error={error} pdf={pdf} source={state.source} onFile={chooseFile} onPage={choosePage} />}
      {current === "scale" && source && overview && <ScaleStep state={state} dispatch={dispatch} source={source} overview={overview} language={language} />}
      {state.step === "unit" && source && overview && <UnitStep state={state} dispatch={dispatch} source={source} overview={overview} language={language} preparing={preparing} failed={prepareFailed} onManual={() => void traceByHand()} onAi={aiAvailable ? () => void askAi() : undefined} />}
      {state.step === "detect" && <DetectStep language={language} picture={aiJob?.url ?? null} readingSince={readingSince} error={readError} onConfirm={() => void readWithAi()} onCancel={() => reading.current?.abort()} onManual={() => void traceByHand()} />}
      {current === "review" && analysis && <ReviewStep state={state} dispatch={dispatch} analysis={analysis} language={language} />}
      {current === "check" && <CheckStep state={state} dispatch={dispatch} language={language} needsConfirm={needsConfirm} onUse={onUse} />}
    </section>
  );
}
