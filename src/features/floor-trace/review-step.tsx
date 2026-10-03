"use client";

import { useMemo, useState, type Dispatch } from "react";
import { AppWindow, ArrowRight, Check, DoorOpen, MousePointer2, Redo2, RectangleHorizontal, ScanSearch, Trash2, Undo2 } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { doorGeometry, wallAxis, type Box } from "@/lib/geometry/architecture";
import { traceGeometry } from "@/lib/floorplan/build";
import { ROOM_KIND_NAMES, ROOM_KINDS } from "@/lib/floorplan/names";
import { EDGE_SIDES, type EdgeSide, type EdgeStatus, type TraceRoom } from "@/lib/floorplan/trace";
import { drawnWindows, nearestFace, scanOpenings, snapTraceEdge, snapTraceRooms, traceOpening } from "@/lib/floorplan/trace-snap";
import { MIN_ROOM_CM } from "@/lib/floorplan/validate";
import type { Language, Position2D, RoomKind, Wall } from "@/types/domain";
import type { PlanAnalysis } from "./analysis";
import { NumberField } from "./number-field";
import { PlanView } from "./plan-view";
import type { TraceAction, TraceState } from "./trace-state";

type Mode = "select" | "room" | "door" | "window";

export const KIND_COLORS: Record<RoomKind, string> = { living: "#efd49b", bedroom: "#a9cde6", kitchen: "#efb9a9", bathroom: "#b5dcc6", other: "#d4cbe3" };
const EDGE_STYLE: Record<EdgeStatus, { stroke: string; width: number; dash?: [number, number] }> = {
  verified: { stroke: "#1f6b56", width: 2.5 },
  manual: { stroke: "#202c29", width: 2.5 },
  unverified: { stroke: "#c77d0a", width: 3.5, dash: [7, 5] },
  open: { stroke: "#6f7f76", width: 2, dash: [2, 4] },
};
export const DEFAULT_DOOR_CM = 80;
export const DEFAULT_WINDOW_CM = 120;
const HANDLE_PX = 7;
const HIT_PX = 14;
const BOX_KEY: Record<EdgeSide, keyof Box> = { top: "minZ", bottom: "maxZ", left: "minX", right: "maxX" };
const horizontal = (side: EdgeSide) => side === "top" || side === "bottom";

function wallRect(wall: Wall) {
  const half = wall.thickness / 2;
  return wallAxis(wall) === "x"
    ? { x: wall.start.x, y: wall.start.z - half, width: wall.end.x - wall.start.x, height: wall.thickness }
    : { x: wall.start.x - half, y: wall.start.z, width: wall.thickness, height: wall.end.z - wall.start.z };
}

function handlePoint(box: Box, side: EdgeSide): Position2D {
  const [cx, cz] = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
  return side === "top" ? { x: cx, z: box.minZ } : side === "bottom" ? { x: cx, z: box.maxZ } : side === "left" ? { x: box.minX, z: cz } : { x: box.maxX, z: cz };
}

const inside = (box: Box, point: Position2D, margin = 0) => point.x >= box.minX - margin && point.x <= box.maxX + margin && point.z >= box.minZ - margin && point.z <= box.maxZ + margin;

interface ReviewStepProps {
  state: TraceState;
  dispatch: Dispatch<TraceAction>;
  analysis: PlanAnalysis;
  language: Language;
}

export function ReviewStep({ state, dispatch, analysis, language }: ReviewStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const { plan, selection } = state;
  const geometry = useMemo(() => traceGeometry(plan), [plan]);
  const [mode, setMode] = useState<Mode>("select");
  const [notice, setNotice] = useState<{ key: TraceTranslationKey; parameters?: Record<string, number>; tone: "error" | "status" } | null>(null);
  const warn = (key: TraceTranslationKey) => setNotice({ key, tone: "error" });
  const [drawing, setDrawing] = useState<{ from: Position2D; to: Position2D } | null>(null);
  const [edgeDrag, setEdgeDrag] = useState<{ roomId: string; side: EdgeSide; position: number } | null>(null);
  const name = (traceId: string | undefined) => {
    const index = plan.rooms.findIndex((room) => room.id === traceId);
    return index >= 0 ? geometry.rooms[index].name[language] : "";
  };
  const selectedRoom = selection?.kind === "room" ? plan.rooms.find((room) => room.id === selection.id) ?? null : null;
  const unchecked = plan.rooms.reduce((sum, room) => sum + EDGE_SIDES.filter((side) => room.edges[side].status === "unverified").length, 0);
  const boxOf = (room: TraceRoom): Box => edgeDrag?.roomId === room.id ? { ...room.box, [BOX_KEY[edgeDrag.side]]: edgeDrag.position } : room.box;

  /** The rooms either side of a wall at a point on it, as trace IDs (undefined for outside). */
  function wallRooms(wall: Wall, at: Position2D): readonly [string, string] | null {
    const offset = wall.thickness / 2 + 5;
    const probe = (sign: number) => wallAxis(wall) === "x" ? { x: at.x, z: wall.start.z + sign * offset } : { x: wall.start.x + sign * offset, z: at.z };
    const [low, high] = [-1, 1].map((sign) => plan.rooms.find((room) => inside(room.box, probe(sign)))?.id);
    return low && high ? [low, high] : null;
  }

  function select(point: Position2D, unit: number) {
    const near = (at: Position2D) => Math.hypot(at.x - point.x, at.z - point.z) <= HIT_PX * unit;
    const door = geometry.doors.find((entry) => near(entry.position)) ?? plan.doors.find((entry) => near(entry.at));
    if (door) return dispatch({ type: "select", selection: { kind: "door", id: door.id } });
    const window = geometry.windows.find((entry) => near(entry.position)) ?? plan.windows.find((entry) => near(entry.at));
    if (window) return dispatch({ type: "select", selection: { kind: "window", id: window.id } });
    const wall = geometry.walls.find((entry) => {
      const rect = wallRect(entry);
      return inside({ minX: rect.x, maxX: rect.x + rect.width, minZ: rect.y, maxZ: rect.y + rect.height }, point, 3 * unit);
    });
    if (wall) return dispatch({ type: "select", selection: { kind: "wall", id: wall.id, rooms: wallRooms(wall, point) } });
    const room = plan.rooms.filter((entry) => inside(entry.box, point)).sort((first, second) => (first.box.maxX - first.box.minX) * (first.box.maxZ - first.box.minZ) - (second.box.maxX - second.box.minX) * (second.box.maxZ - second.box.minZ))[0];
    dispatch({ type: "select", selection: room ? { kind: "room", id: room.id } : null });
  }

  function addOpening(kind: "door" | "window", point: Position2D) {
    const opening = traceOpening(analysis.context, plan, point);
    const face = nearestFace(plan, point);
    if (!opening && !face) {
      warn("review.tapWall");
      return;
    }
    const at = opening?.at ?? (horizontal(face!.side) ? { x: point.x, z: face!.room.box[BOX_KEY[face!.side]] } : { x: face!.room.box[BOX_KEY[face!.side]], z: point.z });
    if (kind === "door") dispatch({ type: "edit", edit: { type: "door-add", door: { at, width: opening?.kind === "door" ? opening.width : DEFAULT_DOOR_CM, ...(opening?.swingInto ? { swingInto: opening.swingInto } : {}), ...(opening?.kind === "door" ? {} : { flagged: true }) } } });
    else dispatch({ type: "edit", edit: { type: "window-add", window: { at, width: opening?.kind === "window" ? opening.width : DEFAULT_WINDOW_CM, roomId: opening?.roomId ?? face!.room.id } } });
  }

  /** Adds every door and window the drawing shows along the traced rooms that the plan lacks, as one step. */
  function findOpenings() {
    const scanned = scanOpenings(analysis.context, plan);
    const near = (first: Position2D, second: Position2D, limit: number) => Math.hypot(first.x - second.x, first.z - second.z) < limit;
    const doors = scanned.filter((opening) => opening.kind === "door" && (opening.swings || opening.jambs === 2) && !plan.doors.some((door) => near(door.at, opening.at, 30)))
      .map((opening) => ({ at: opening.at, width: opening.width, ...(opening.swingInto ? { swingInto: opening.swingInto } : {}) }));
    const windows = drawnWindows(plan, scanned).filter((window) => !plan.windows.some((entry) => near(entry.at, window.at, 40)));
    if (doors.length + windows.length === 0) {
      setNotice({ key: "review.foundNone", tone: "status" });
      return;
    }
    dispatch({ type: "edit", edit: { type: "openings-add", doors, windows } });
    setNotice({ key: "review.foundOpenings", parameters: { doors: doors.length, windows: windows.length }, tone: "status" });
  }

  const tool = {
    down(point: Position2D, unit: number) {
      setNotice(null);
      if (mode === "room") {
        setDrawing({ from: point, to: point });
        return true;
      }
      if (mode === "select" && selectedRoom) {
        const side = EDGE_SIDES.find((entry) => {
          const handle = handlePoint(selectedRoom.box, entry);
          return Math.hypot(handle.x - point.x, handle.z - point.z) <= HIT_PX * unit;
        });
        if (side) {
          setEdgeDrag({ roomId: selectedRoom.id, side, position: selectedRoom.box[BOX_KEY[side]] });
          return true;
        }
      }
      return false;
    },
    move(point: Position2D) {
      if (drawing) setDrawing({ ...drawing, to: point });
      if (edgeDrag) setEdgeDrag({ ...edgeDrag, position: horizontal(edgeDrag.side) ? point.z : point.x });
    },
    up(point: Position2D) {
      if (mode === "room" && drawing) {
        const box = { minX: Math.min(drawing.from.x, point.x), maxX: Math.max(drawing.from.x, point.x), minZ: Math.min(drawing.from.z, point.z), maxZ: Math.max(drawing.from.z, point.z) };
        setDrawing(null);
        if (box.maxX - box.minX < MIN_ROOM_CM || box.maxZ - box.minZ < MIN_ROOM_CM) {
          warn("review.tooSmall");
          return;
        }
        const [snapped] = snapTraceRooms(analysis.context, [{ id: "new", kind: "other", box }]);
        dispatch({ type: "edit", edit: { type: "room-add", room: { kind: "other", box: snapped.box, edges: snapped.edges } } });
        setMode("select");
        return;
      }
      if (edgeDrag) {
        const room = plan.rooms.find((entry) => entry.id === edgeDrag.roomId);
        setEdgeDrag(null);
        if (!room) return;
        const result = snapTraceEdge(analysis.context, room, edgeDrag.side, edgeDrag.position);
        if (result.box.maxX - result.box.minX < MIN_ROOM_CM || result.box.maxZ - result.box.minZ < MIN_ROOM_CM) {
          warn("review.tooSmall");
          return;
        }
        dispatch({ type: "edit", edit: { type: "room-update", id: room.id, box: result.box, edges: { [edgeDrag.side]: result.edge } } });
      }
    },
    tap(point: Position2D, unit: number) {
      setNotice(null);
      if (mode === "door" || mode === "window") {
        addOpening(mode, point);
        setMode("select");
      } else if (mode === "select") select(point, unit);
    },
  };

  const modes: { mode: Mode; icon: typeof MousePointer2; label: TraceTranslationKey }[] = [
    { mode: "select", icon: MousePointer2, label: "review.mode.select" },
    { mode: "room", icon: RectangleHorizontal, label: "review.mode.room" },
    { mode: "door", icon: DoorOpen, label: "review.mode.door" },
    { mode: "window", icon: AppWindow, label: "review.mode.window" },
  ];
  const selectedDoor = selection?.kind === "door" ? plan.doors.find((door) => door.id === selection.id) ?? null : null;
  const selectedWindow = selection?.kind === "window" ? plan.windows.find((window) => window.id === selection.id) ?? null : null;
  const pseudoFlat = { walls: geometry.walls, rooms: geometry.rooms };

  return (
    <div className="trace-body">
      <PlanView width={analysis.widthCm} height={analysis.heightCm} image={analysis.url} label={t("trace.plan")} zoomInLabel={t("trace.zoomIn")} zoomOutLabel={t("trace.zoomOut")} fitLabel={t("trace.fit")} hint={t("trace.panHint")} tool={tool} className={`trace-mode-${mode}`}>
        {(unit) => (
          <>
            {geometry.walls.map((wall) => {
              const rect = wallRect(wall);
              const selected = selection?.kind === "wall" && selection.id === wall.id;
              return <rect key={wall.id} {...rect} fill={selected ? "#245f5099" : "#3e4a4466"} />;
            })}
            {plan.rooms.map((room, index) => {
              const box = boxOf(room);
              const selected = selection?.kind === "room" && selection.id === room.id;
              return (
                <g key={room.id}>
                  <rect x={box.minX} y={box.minZ} width={box.maxX - box.minX} height={box.maxZ - box.minZ} fill={KIND_COLORS[room.kind]} fillOpacity={selected ? 0.55 : 0.35} />
                  {EDGE_SIDES.map((side) => {
                    const style = EDGE_STYLE[edgeDrag?.roomId === room.id && edgeDrag.side === side ? "manual" : room.edges[side].status];
                    const [x1, z1, x2, z2] = side === "top" ? [box.minX, box.minZ, box.maxX, box.minZ] : side === "bottom" ? [box.minX, box.maxZ, box.maxX, box.maxZ] : side === "left" ? [box.minX, box.minZ, box.minX, box.maxZ] : [box.maxX, box.minZ, box.maxX, box.maxZ];
                    return <line key={side} x1={x1} y1={z1} x2={x2} y2={z2} stroke={style.stroke} strokeWidth={style.width * unit} strokeDasharray={style.dash ? `${style.dash[0] * unit} ${style.dash[1] * unit}` : undefined} />;
                  })}
                  <text x={box.minX + 6 * unit} y={box.minZ + 16 * unit} fontSize={12 * unit} className="trace-room-label">{geometry.rooms[index].name[language]}</text>
                  <text x={box.minX + 6 * unit} y={box.minZ + 31 * unit} fontSize={11 * unit} className="trace-room-size">{formatCm(box.maxX - box.minX, language)} × {formatCm(box.maxZ - box.minZ, language)}</text>
                  {selected && EDGE_SIDES.map((side) => {
                    const handle = handlePoint(box, side);
                    return <circle key={side} cx={handle.x} cy={handle.z} r={HANDLE_PX * unit} fill="white" stroke="#245f50" strokeWidth={2 * unit} className="trace-handle" />;
                  })}
                </g>
              );
            })}
            {geometry.doors.map((door) => {
              const shape = doorGeometry(door, pseudoFlat);
              const selected = selection?.kind === "door" && selection.id === door.id;
              const color = selected ? "#245f50" : plan.doors.find((entry) => entry.id === door.id)?.flagged ? "#c77d0a" : "#8a6d1f";
              return <g key={door.id}><path d={`M ${shape.closedEnd.x} ${shape.closedEnd.z} A ${door.width} ${door.width} 0 0 ${shape.sweep} ${shape.openEnd.x} ${shape.openEnd.z}`} fill="none" stroke={color} strokeWidth={1.5 * unit} /><line x1={shape.hinge.x} y1={shape.hinge.z} x2={shape.openEnd.x} y2={shape.openEnd.z} stroke={color} strokeWidth={3 * unit} /><circle cx={door.position.x} cy={door.position.z} r={(selected ? 6 : 4) * unit} fill={color} /></g>;
            })}
            {geometry.windows.map((window) => {
              const wall = geometry.walls.find((entry) => entry.id === window.wallId)!;
              const alongX = wallAxis(wall) === "x";
              const selected = selection?.kind === "window" && selection.id === window.id;
              return <g key={window.id}><line x1={window.position.x - (alongX ? window.width / 2 : 0)} y1={window.position.z - (alongX ? 0 : window.width / 2)} x2={window.position.x + (alongX ? window.width / 2 : 0)} y2={window.position.z + (alongX ? 0 : window.width / 2)} stroke={selected ? "#245f50" : "#2f86a0"} strokeWidth={6 * unit} strokeLinecap="round" /></g>;
            })}
            {geometry.problems.map((problem) => {
              const entry = plan.doors.find((door) => door.id === problem.id) ?? plan.windows.find((window) => window.id === problem.id);
              return entry && <circle key={problem.id} cx={entry.at.x} cy={entry.at.z} r={7 * unit} fill="#de393599" stroke="#aa352d" strokeWidth={2 * unit} />;
            })}
            {drawing && <rect x={Math.min(drawing.from.x, drawing.to.x)} y={Math.min(drawing.from.z, drawing.to.z)} width={Math.abs(drawing.to.x - drawing.from.x)} height={Math.abs(drawing.to.z - drawing.from.z)} fill="#245f5022" stroke="#245f50" strokeWidth={2 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />}
          </>
        )}
      </PlanView>
      <aside className="trace-panel" aria-labelledby="trace-review-title">
        <h2 id="trace-review-title">{t("review.title")}</h2>
        <p className="constraint-note">{state.readBy === "ai" ? t("review.readByAi", { model: state.model ?? "AI" }) : t("review.manual")}</p>
        {state.aiNotes && (
          <ul className="trace-checklist trace-notes">
            <li>{t("review.found", { rooms: plan.rooms.length, doors: plan.doors.length, windows: plan.windows.length })}</li>
            {state.aiNotes.outside > 0 && <li>{t("review.outside", { count: state.aiNotes.outside })}</li>}
            {state.aiNotes.dropped > 0 && <li>{t("review.dropped", { count: state.aiNotes.dropped })}</li>}
            {state.aiNotes.diagonal && <li>{t("review.diagonal")}</li>}
          </ul>
        )}
        <div className="trace-toolbar">
          <div className="segmented trace-modes" role="group" aria-label={t("review.tools")}>
            {modes.map((entry) => <button key={entry.mode} type="button" aria-pressed={mode === entry.mode} title={t(entry.label)} onClick={() => { setMode(entry.mode); setNotice(null); }}><entry.icon size={16} aria-hidden="true" /><span>{t(entry.label)}</span></button>)}
          </div>
          <div className="history-tools">
            <button type="button" className="icon-button" disabled={state.past.length === 0} aria-label={t("review.undo")} title={t("review.undo")} onClick={() => dispatch({ type: "undo" })}><Undo2 size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" disabled={state.future.length === 0} aria-label={t("review.redo")} title={t("review.redo")} onClick={() => dispatch({ type: "redo" })}><Redo2 size={18} aria-hidden="true" /></button>
          </div>
        </div>
        <button type="button" className="secondary-button" disabled={plan.rooms.length === 0} onClick={findOpenings}><ScanSearch size={17} aria-hidden="true" />{t("review.findOpenings")}</button>
        {notice && <p className={notice.tone === "error" ? "field-error" : "suggestion-status"} role="status">{t(notice.key, notice.parameters)}</p>}
        <p className="constraint-note">{t("review.legend")}</p>
        {plan.rooms.length === 0 ? <p className="trace-warning">{t("review.empty")}</p> : unchecked > 0 ? <p className="trace-warning" role="status">{t("review.unchecked", { count: unchecked })}</p> : <p className="trace-ok" role="status"><Check size={16} aria-hidden="true" />{t("review.allChecked")}</p>}

        {selectedRoom && (
          <section className="trace-selection" aria-label={t("review.room")}>
            <h3>{name(selectedRoom.id)}</h3>
            <label className="room-picker trace-field">{t("review.room.kind")}
              <select value={selectedRoom.kind} onChange={(event) => dispatch({ type: "edit", edit: { type: "room-update", id: selectedRoom.id, kind: event.target.value as RoomKind } })}>
                {ROOM_KINDS.map((kind) => <option key={kind} value={kind}>{ROOM_KIND_NAMES[kind][language]}</option>)}
              </select>
            </label>
            <p>{t("review.room.size", { width: formatCm(selectedRoom.box.maxX - selectedRoom.box.minX, language), depth: formatCm(selectedRoom.box.maxZ - selectedRoom.box.minZ, language), area: formatCm(Math.round((selectedRoom.box.maxX - selectedRoom.box.minX) * (selectedRoom.box.maxZ - selectedRoom.box.minZ) / 1000) / 10, language) })}</p>
            <h4>{t("review.edges")}</h4>
            <ul className="trace-edges">
              {EDGE_SIDES.map((side) => {
                const edge = selectedRoom.edges[side];
                return (
                  <li key={side} data-status={edge.status}>
                    <span><strong>{t(`review.side.${side}`)}</strong> · {edge.status === "verified" && edge.thickness !== undefined ? t("review.edge.thickness", { thickness: formatCm(edge.thickness, language) }) : t(`review.edge.${edge.status}`)}</span>
                    {edge.status === "unverified" && <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "edge-checked", id: selectedRoom.id, side } })}><Check size={15} aria-hidden="true" />{t("review.edge.check")}</button>}
                  </li>
                );
              })}
            </ul>
            <p className="constraint-note">{t("review.edge.drag")}</p>
            <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "room-delete", id: selectedRoom.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.room.delete")}</button>
          </section>
        )}

        {selectedDoor && (
          <section className="trace-selection" aria-label={t("review.door")}>
            <h3>{t("review.door")}</h3>
            <NumberField id={`door-width-${selectedDoor.id}`} label={t("review.door.width")} unit={t("trace.cm")} value={selectedDoor.width} minimum={50} maximum={200} onChange={(width) => dispatch({ type: "edit", edit: { type: "door-update", id: selectedDoor.id, patch: { width, flagged: false } } })} />
            {selectedDoor.flagged && <p className="trace-warning">{t("review.door.flagged")}</p>}
            <label className="room-picker trace-field">{t("review.door.swing")}
              <select value={selectedDoor.swingInto ?? ""} onChange={(event) => dispatch({ type: "edit", edit: { type: "door-update", id: selectedDoor.id, patch: { swingInto: event.target.value || undefined } } })}>
                <option value="">{t("review.door.swingAuto")}</option>
                {plan.rooms.map((room) => <option key={room.id} value={room.id}>{name(room.id)}</option>)}
              </select>
            </label>
            <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "door-delete", id: selectedDoor.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.door.delete")}</button>
          </section>
        )}

        {selectedWindow && (
          <section className="trace-selection" aria-label={t("review.window")}>
            <h3>{t("review.window")}</h3>
            <NumberField id={`window-width-${selectedWindow.id}`} label={t("review.window.width")} unit={t("trace.cm")} value={selectedWindow.width} minimum={20} maximum={1000} onChange={(width) => dispatch({ type: "edit", edit: { type: "window-update", id: selectedWindow.id, patch: { width } } })} />
            <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "window-delete", id: selectedWindow.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.window.delete")}</button>
          </section>
        )}

        {selection?.kind === "wall" && (
          <section className="trace-selection">
            {selection.rooms ? (
              <>
                <p>{t("review.wall.inner", { first: name(selection.rooms[0]), second: name(selection.rooms[1]) })}</p>
                <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "open-pair", rooms: selection.rooms!, open: true } })}>{t("review.wall.remove")}</button>
              </>
            ) : <p>{t("review.wall.outer")}</p>}
          </section>
        )}

        {plan.openPairs.length > 0 && (
          <section className="trace-selection" aria-labelledby="trace-open-title">
            <h3 id="trace-open-title">{t("review.open")}</h3>
            <ul className="trace-edges">
              {plan.openPairs.map((pair) => (
                <li key={pair.join("|")}>
                  <span>{t("review.open.item", { first: name(pair[0]), second: name(pair[1]) })}</span>
                  <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "open-pair", rooms: pair, open: false } })}>{t("review.open.restore")}</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="trace-fields">
          <div className="dimension-field">
            <label htmlFor="trace-ceiling">{t("review.ceiling")}</label>
            <div className="input-with-unit"><input id="trace-ceiling" type="text" inputMode="decimal" value={state.ceiling} aria-describedby="trace-ceiling-range" onChange={(event) => dispatch({ type: "ceiling", value: event.target.value })} /><span>{t("trace.cm")}</span></div>
            <p id="trace-ceiling-range" className="field-hint">{t("review.ceilingRange")}</p>
          </div>
          <div className="dimension-field">
            <label htmlFor="trace-area">{t("review.area")}</label>
            <div className="input-with-unit"><input id="trace-area" type="text" inputMode="decimal" value={state.declaredArea} aria-describedby="trace-area-hint" onChange={(event) => dispatch({ type: "declared-area", value: event.target.value })} /><span>{t("review.areaUnit")}</span></div>
            <p id="trace-area-hint" className="field-hint">{t("review.areaHint")}</p>
          </div>
        </div>
        <div className="trace-actions">
          <button type="button" className="primary-button" disabled={plan.rooms.length === 0} onClick={() => dispatch({ type: "step", step: "check" })}>{t("review.next")}<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </aside>
    </div>
  );
}
