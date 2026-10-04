"use client";

import { useState, type Dispatch } from "react";
import { LoaderCircle, PencilRuler, Sparkles } from "lucide-react";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { formatCm } from "@/i18n/dictionary";
import { TRACE_INK } from "@/lib/theme";
import type { Box } from "@/lib/geometry/architecture";
import { flatTypeIn } from "@/lib/floorplan/labels";
import { FLAT_TYPES, isFlatType } from "@/lib/floorplan/trace";
import type { Language, Position2D } from "@/types/domain";
import { measureAngle } from "./analysis";
import { PlanView } from "./plan-view";
import type { PlanSource } from "./plan-source";
import type { TraceAction, TraceState } from "./trace-state";

/** Smaller angles are drawing noise, not a turned wing. */
const STRAIGHTEN_FROM_DEGREES = 0.5;
const MIN_BOX_PX = 12;

interface UnitStepProps {
  state: TraceState;
  dispatch: Dispatch<TraceAction>;
  source: PlanSource;
  overview: string;
  language: Language;
  /** Set while the crop is being prepared, or after it failed. */
  preparing: boolean;
  failed: boolean;
  onManual: () => void;
  /** Absent while AI reading is unavailable. */
  onAi?: () => void;
}

const boxOf = (first: Position2D, second: Position2D): Box => ({ minX: Math.min(first.x, second.x), maxX: Math.max(first.x, second.x), minZ: Math.min(first.z, second.z), maxZ: Math.max(first.z, second.z) });

export function UnitStep({ state, dispatch, source, overview, language, preparing, failed, onManual, onAi }: UnitStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const [drag, setDrag] = useState<{ from: Position2D; to: Position2D } | null>(null);
  const [labelled, setLabelled] = useState(false);
  const { unit } = state;
  const box = drag ? boxOf(drag.from, drag.to) : unit.box;

  async function chooseBox(next: Box) {
    const flatType = flatTypeIn(await source.text(), next);
    setLabelled(flatType !== null);
    dispatch({ type: "unit-box", box: next, flatType });
    const angle = await measureAngle(source, next).catch(() => null);
    dispatch({ type: "measured-angle", angle });
    if (angle !== null && Math.abs(angle) >= STRAIGHTEN_FROM_DEGREES) dispatch({ type: "rotation", rotation: angle });
  }

  const tool = {
    down(point: Position2D) {
      if (preparing) return false;
      setDrag({ from: point, to: point });
      return true;
    },
    move(point: Position2D) {
      setDrag((current) => current && { ...current, to: point });
    },
    up(point: Position2D, unitSize: number) {
      if (!drag) return;
      const next = boxOf(drag.from, point);
      setDrag(null);
      if (next.maxX - next.minX >= MIN_BOX_PX * unitSize && next.maxZ - next.minZ >= MIN_BOX_PX * unitSize) void chooseBox(next);
    },
  };

  const angle = unit.measuredAngle;
  const turned = Math.abs(angle ?? 0) >= STRAIGHTEN_FROM_DEGREES;
  return (
    <div className="trace-body">
      <PlanView width={source.width} height={source.height} image={overview} label={t("trace.plan")} zoomInLabel={t("trace.zoomIn")} zoomOutLabel={t("trace.zoomOut")} fitLabel={t("trace.fit")} hint={t("trace.panHint")} tool={tool}>
        {(unitSize) => box && <rect x={box.minX} y={box.minZ} width={box.maxX - box.minX} height={box.maxZ - box.minZ} fill={TRACE_INK.selection} fillOpacity={0.13} stroke={TRACE_INK.selection} strokeWidth={2 * unitSize} strokeDasharray={drag ? `${6 * unitSize} ${4 * unitSize}` : undefined} />}
      </PlanView>
      <aside className="trace-panel" aria-labelledby="trace-unit-title">
        <h2 id="trace-unit-title">{t("unit.title")}</h2>
        <p>{t("unit.hint")}</p>
        <label className="room-picker trace-field">{t("unit.type")}
          <select value={unit.flatType ?? ""} onChange={(event) => dispatch({ type: "flat-type", flatType: isFlatType(event.target.value) ? event.target.value : null })}>
            <option value="">{t("unit.typeUnknown")}</option>
            {FLAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        {labelled && unit.flatType && <p className="constraint-note">{t("unit.typeFound")}</p>}
        {unit.box && angle !== null && (turned ? (
          <>
            <p className="constraint-note">{t("unit.angle", { angle: formatCm(Math.round(angle * 10) / 10, language) })}</p>
            <label className="position-lock-toggle"><input type="checkbox" checked={unit.rotation !== 0} onChange={(event) => dispatch({ type: "rotation", rotation: event.target.checked ? angle : 0 })} />{t("unit.straighten", { angle: formatCm(Math.round(angle * 10) / 10, language) })}</label>
          </>
        ) : <p className="constraint-note">{t("unit.aligned")}</p>)}
        {!unit.box && <p className="constraint-note">{t("unit.needBox")}</p>}
        {preparing && <p className="trace-status" role="status"><LoaderCircle className="loading-icon" size={16} aria-hidden="true" />{t("unit.preparing")}</p>}
        {failed && <p className="field-error" role="alert">{t("unit.failed")}</p>}
        <div className="trace-actions trace-actions-stacked">
          {onAi && <button type="button" className="primary-button" disabled={!unit.box || preparing} onClick={onAi}><Sparkles size={17} aria-hidden="true" />{t("unit.ai")}</button>}
          <button type="button" className={onAi ? "secondary-button" : "primary-button"} disabled={!unit.box || preparing} onClick={onManual}><PencilRuler size={17} aria-hidden="true" />{t("unit.manual")}</button>
        </div>
      </aside>
    </div>
  );
}
