"use client";

import { useState, type Dispatch } from "react";
import { ArrowRight, Eraser, LoaderCircle } from "lucide-react";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { formatCm } from "@/i18n/dictionary";
import { TRACE_INK } from "@/lib/theme";
import { MAX_IMAGE_UPSCALE, TARGET_CM_PER_PX } from "@/lib/floorplan/frames";
import type { PlanPoint } from "@/lib/floorplan/scale";
import type { Language, Position2D } from "@/types/domain";
import { snapToTick } from "./analysis";
import { PlanView } from "./plan-view";
import type { PlanSource } from "./plan-source";
import { scaleOf, type TraceAction, type TraceState } from "./trace-state";

/** How far around a tap a scale-bar tick is looked for, in source units. */
const TICK_REACH = { pdf: 6, image: 14 };
const MARKER_PX = 9;
const HIT_PX = 18;

interface ScaleStepProps {
  state: TraceState;
  dispatch: Dispatch<TraceAction>;
  source: PlanSource;
  overview: string;
  language: Language;
}

const toPoint = (point: Position2D): PlanPoint => ({ x: point.x, y: point.z });

export function ScaleStep({ state, dispatch, source, overview, language }: ScaleStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const [drag, setDrag] = useState<{ index: 0 | 1; point: PlanPoint } | null>(null);
  const [busy, setBusy] = useState(false);
  const { scale } = state;
  const cmPerUnit = scaleOf(scale);
  const points = scale.points.map((point, index) => drag?.index === index ? drag.point : point);

  async function place(index: 0 | 1, point: PlanPoint) {
    let placed = point;
    if (scale.method === "scale-bar") {
      setBusy(true);
      try {
        placed = await snapToTick(source, point, TICK_REACH[source.kind]) ?? point;
      } catch {
        placed = point;
      } finally {
        setBusy(false);
      }
    }
    dispatch({ type: "scale-point", index, point: placed });
  }

  /** The marker a tap moves: the first one not placed yet, else the nearer one. */
  const markerFor = (point: PlanPoint): 0 | 1 => {
    const [first, second] = scale.points;
    if (!first) return 0;
    if (!second) return 1;
    return Math.hypot(first.x - point.x, first.y - point.y) <= Math.hypot(second.x - point.x, second.y - point.y) ? 0 : 1;
  };

  const tool = {
    down(position: Position2D, unit: number) {
      const point = toPoint(position);
      const hit = scale.points.findIndex((entry) => entry && Math.hypot(entry.x - point.x, entry.y - point.y) <= HIT_PX * unit);
      if (hit < 0) return false;
      setDrag({ index: hit as 0 | 1, point });
      return true;
    },
    move(position: Position2D) {
      setDrag((current) => current && { ...current, point: toPoint(position) });
    },
    up(position: Position2D) {
      if (drag) void place(drag.index, toPoint(position));
      setDrag(null);
    },
    tap(position: Position2D) {
      const point = toPoint(position);
      void place(markerFor(point), point);
    },
  };

  const analysedCmPerPx = cmPerUnit === null ? null : source.kind === "pdf" ? TARGET_CM_PER_PX : Math.max(TARGET_CM_PER_PX, cmPerUnit / MAX_IMAGE_UPSCALE);
  return (
    <div className="trace-body">
      <PlanView width={source.width} height={source.height} image={overview} label={t("trace.plan")} zoomInLabel={t("trace.zoomIn")} zoomOutLabel={t("trace.zoomOut")} fitLabel={t("trace.fit")} hint={t("trace.panHint")} tool={tool}>
        {(unit) => (
          <>
            {points[0] && points[1] && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke={TRACE_INK.marker} strokeWidth={2 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />}
            {points.map((point, index) => point && (
              <g key={index} className="trace-marker">
                <circle cx={point.x} cy={point.y} r={MARKER_PX * unit} fill="none" stroke={TRACE_INK.marker} strokeWidth={2 * unit} />
                <line x1={point.x} y1={point.y - MARKER_PX * 1.8 * unit} x2={point.x} y2={point.y + MARKER_PX * 1.8 * unit} stroke={TRACE_INK.marker} strokeWidth={unit} />
                <line x1={point.x - MARKER_PX * 1.8 * unit} y1={point.y} x2={point.x + MARKER_PX * 1.8 * unit} y2={point.y} stroke={TRACE_INK.marker} strokeWidth={unit} />
                <text x={point.x + MARKER_PX * 1.3 * unit} y={point.y - MARKER_PX * 1.3 * unit} fontSize={13 * unit} fill={TRACE_INK.markerText} fontWeight={700}>{index + 1}</text>
              </g>
            ))}
          </>
        )}
      </PlanView>
      <aside className="trace-panel" aria-labelledby="trace-scale-title">
        <h2 id="trace-scale-title">{t("scale.title")}</h2>
        <div className="segmented" role="group" aria-label={t("scale.title")}>
          {(["scale-bar", "known-length"] as const).map((method) => <button key={method} type="button" aria-pressed={scale.method === method} onClick={() => dispatch({ type: "scale-method", method })}>{t(`scale.method.${method}`)}</button>)}
        </div>
        <p>{scale.found ? t("scale.found", { metres: Number(scale.length) / 100 }) : t(scale.method === "scale-bar" ? "scale.barHint" : "scale.lengthHint")}</p>
        <ul className="trace-checklist">
          <li>{t("scale.first")}: {t(scale.points[0] ? "scale.placed" : "scale.missing")}</li>
          <li>{t("scale.second")}: {t(scale.points[1] ? "scale.placed" : "scale.missing")}</li>
        </ul>
        {busy && <p className="trace-status" role="status"><LoaderCircle className="loading-icon" size={16} aria-hidden="true" /></p>}
        <div className="dimension-field">
          <label htmlFor="trace-scale-length">{t("scale.length")}</label>
          <div className="input-with-unit"><input id="trace-scale-length" type="text" inputMode="decimal" value={scale.length} onChange={(event) => dispatch({ type: "scale-length", value: event.target.value })} /><span>{t("trace.cm")}</span></div>
        </div>
        {cmPerUnit !== null ? (
          <>
            <p className="trace-result">{t("scale.result", { cm: formatCm(Math.round(cmPerUnit * 1000) / 1000, language), units: formatCm(Math.round(100 / cmPerUnit * 100) / 100, language) })}</p>
            {analysedCmPerPx !== null && <p className="constraint-note">{t("scale.precision", { cmPerPx: formatCm(Math.round(analysedCmPerPx * 100) / 100, language), px: Math.round(90 / analysedCmPerPx) })}</p>}
          </>
        ) : <p className="constraint-note">{t("scale.incomplete")}</p>}
        <div className="trace-actions">
          <button type="button" className="secondary-button" disabled={!scale.points[0] && !scale.points[1]} onClick={() => { dispatch({ type: "scale-point", index: 0, point: null }); dispatch({ type: "scale-point", index: 1, point: null }); }}><Eraser size={17} aria-hidden="true" />{t("scale.clear")}</button>
          <button type="button" className="primary-button" disabled={cmPerUnit === null} onClick={() => dispatch({ type: "step", step: "unit" })}>{t("scale.next")}<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </aside>
    </div>
  );
}
