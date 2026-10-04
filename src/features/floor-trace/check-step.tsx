"use client";

import { useMemo, type Dispatch } from "react";
import { ArrowLeft, Check, CircleAlert, TriangleAlert } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { TRACE_INK } from "@/lib/theme";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { doorGeometry, wallParts } from "@/lib/geometry/architecture";
import { polygonBounds, rectanglePolygon } from "@/lib/geometry/oriented";
import { interiorPoint } from "@/lib/geometry/polygon";
import { buildFlat, TRACED_CEILING } from "@/lib/floorplan/build";
import type { TraceIssue } from "@/lib/floorplan/validate";
import type { Flat, Language, Position2D } from "@/types/domain";
import { KIND_COLORS } from "./review-step";
import { positiveNumber, scaleOf, type TraceAction, type TraceState } from "./trace-state";

interface CheckStepProps {
  state: TraceState;
  dispatch: Dispatch<TraceAction>;
  language: Language;
  needsConfirm: boolean;
  onUse: (flat: Flat) => void;
}

const points = (polygon: readonly Position2D[]) => polygon.map((point) => `${point.x},${point.z}`).join(" ");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "plan";

/** Rooms, walls (with door gaps) and door swings, from the built flat or, with errors, the raw trace. */
function FlatPreview({ rooms, walls, doors, label, language }: Pick<Flat, "rooms" | "walls" | "doors"> & { label: string; language: Language }) {
  const shapes = rooms.map((room) => ({ room, polygon: room.outline ?? rectanglePolygon(room) }));
  const parts = wallParts({ walls, doors });
  const corners = [...shapes.flatMap((entry) => entry.polygon), ...parts.flatMap(rectanglePolygon)];
  if (corners.length === 0) return null;
  const bounds = polygonBounds(corners);
  const [minX, minZ, width, depth] = [bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ];
  const unit = Math.max(width, depth) / 400;
  return (
    <svg className="trace-preview" viewBox={`${minX - 20} ${minZ - 20} ${width + 40} ${depth + 40}`} role="img" aria-label={label}>
      {shapes.map(({ room, polygon }) => <polygon key={room.id} points={points(polygon)} fill={KIND_COLORS[room.kind ?? "other"]} fillOpacity={0.6} />)}
      {parts.map((part) => <polygon key={part.id} points={points(rectanglePolygon(part))} fill={TRACE_INK.wall} />)}
      {doors.map((door) => {
        const shape = doorGeometry(door, { walls, rooms });
        return <path key={door.id} d={`M ${shape.closedEnd.x} ${shape.closedEnd.z} A ${door.width} ${door.width} 0 0 ${shape.sweep} ${shape.openEnd.x} ${shape.openEnd.z} L ${shape.hinge.x} ${shape.hinge.z}`} fill="none" stroke={TRACE_INK.door} strokeWidth={1.5 * unit} />;
      })}
      {shapes.map(({ room, polygon }) => <text key={`label-${room.id}`} x={(room.outline ? interiorPoint(polygon) : room.position).x} y={(room.outline ? interiorPoint(polygon) : room.position).z} textAnchor="middle" dominantBaseline="middle" fontSize={13 * unit} className="trace-room-label">{room.name[language]}</text>)}
    </svg>
  );
}

export function CheckStep({ state, dispatch, language, needsConfirm, onUse }: CheckStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const ceiling = positiveNumber(state.ceiling);
  const ceilingValid = ceiling !== null && ceiling >= TRACED_CEILING.minimum && ceiling <= TRACED_CEILING.maximum;
  const declared = positiveNumber(state.declaredArea);
  const source = state.source!;
  const cmPerUnit = scaleOf(state.scale)!;
  const result = useMemo(() => {
    const file = source.name.replace(/\.[^.]+$/, "");
    const type = (nameLanguage: Language) => state.unit.flatType ?? traceText(nameLanguage, "check.flatType");
    return buildFlat(state.plan, {
      id: `traced-${slug(file)}-${source.page}-${slug(state.unit.flatType ?? "flat")}`,
      name: { en: traceText("en", "check.flatName", { file, type: type("en") }), "zh-Hant": traceText("zh-Hant", "check.flatName", { file, type: type("zh-Hant") }) },
      ceilingHeight: ceilingValid ? ceiling : TRACED_CEILING.initial,
      trace: { sourceName: source.pageCount > 1 ? `${source.name} (p. ${source.page})` : source.name, scaleMethod: state.scale.method, cmPerUnit, readBy: state.readBy ?? "manual", ...(state.model ? { model: state.model } : {}) },
      flatType: state.unit.flatType,
      declaredAreaM2: declared,
    });
  }, [state.plan, state.unit.flatType, state.scale.method, state.readBy, state.model, source, cmPerUnit, ceiling, ceilingValid, declared]);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");
  const unchecked = warnings.some((issue) => issue.code === "unchecked-edges");
  const message = (issue: TraceIssue) => t(`issue.${issue.code}`, { count: issue.count ?? issue.ids.length, actual: issue.actual ?? "", expected: issue.expected ?? "", percent: issue.percent === undefined ? "" : formatCm(issue.percent, language), detail: issue.detail ?? "", type: state.unit.flatType ?? "" });
  const canUse = result.flat !== null && ceilingValid && (!unchecked || state.checkedEdges);

  return (
    <div className="trace-body trace-check">
      <div className="trace-preview-card">
        <FlatPreview {...(result.flat ?? result.geometry)} label={result.flat?.name[language] ?? t("check.title")} language={language} />
      </div>
      <aside className="trace-panel" aria-labelledby="trace-check-title">
        <h2 id="trace-check-title">{t("check.title")}</h2>
        {result.flat && <p className="trace-result">{t("check.summary", { rooms: result.flat.rooms.length, area: formatCm(Math.round(result.areaM2 * 10) / 10, language), width: formatCm(result.flat.width, language), depth: formatCm(result.flat.depth, language) })}</p>}
        {!ceilingValid && <p className="field-error" role="alert">{t("check.ceilingInvalid")}</p>}
        {errors.length > 0 && (
          <section className="trace-issues" aria-labelledby="trace-errors-title">
            <h3 id="trace-errors-title"><CircleAlert size={16} aria-hidden="true" />{t("check.errors")}</h3>
            <ul>{errors.map((issue) => <li key={`${issue.code}-${issue.ids.join()}`}>{message(issue)}</li>)}</ul>
          </section>
        )}
        {warnings.length > 0 && (
          <section className="trace-issues is-warning" aria-labelledby="trace-warnings-title">
            <h3 id="trace-warnings-title"><TriangleAlert size={16} aria-hidden="true" />{t("check.warnings")}</h3>
            <ul>{warnings.map((issue) => <li key={`${issue.code}-${issue.ids.join()}`}>{message(issue)}</li>)}</ul>
          </section>
        )}
        {result.issues.length === 0 && <p className="trace-ok"><Check size={16} aria-hidden="true" />{t("check.ok")}</p>}
        {unchecked && <label className="position-lock-toggle"><input type="checkbox" checked={state.checkedEdges} onChange={(event) => dispatch({ type: "checked-edges", value: event.target.checked })} />{t("check.confirmEdges")}</label>}
        {needsConfirm && result.flat && <p className="trace-warning">{t("check.confirm")}</p>}
        <div className="trace-actions">
          <button type="button" className="secondary-button" onClick={() => dispatch({ type: "step", step: "review" })}><ArrowLeft size={17} aria-hidden="true" />{t("check.back")}</button>
          <button type="button" className="primary-button" disabled={!canUse} onClick={() => result.flat && onUse(result.flat)}><Check size={17} aria-hidden="true" />{t("check.use")}</button>
        </div>
      </aside>
    </div>
  );
}
