"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { LockKeyhole, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { FURNITURE_COLORS } from "@/components/scene/palette";
import { formatCm, translate } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { containingRoom, doorGeometry, flatVoids, wallAxis, wallParts } from "@/lib/geometry/architecture";
import { issueItemIds, issuePolygons } from "@/lib/geometry/layout";
import { polygonBounds, polygonCentre, rectanglePolygon } from "@/lib/geometry/oriented";
import type { Flat, FlatFurniture, Language, LayoutViolation, Position2D } from "@/types/domain";
import { clampView, clientToPlan, draggedPosition, ensureVisible, fitRoomView, flatBounds, isZoomed, MIN_VIEW_WIDTH_CM, nearestPlanItem, panBy, planHome, ROOM_MARGIN_CM, zoomAt, type PlanBox } from "./interaction";

/** A request to the plan view; a new revision re-applies it even when the id is unchanged. */
export interface PlanRequest {
  id: string | null;
  revision: number;
}

interface FloorPlanProps {
  flat: Flat;
  furniture: readonly FlatFurniture[];
  baseline?: readonly FlatFurniture[];
  issues: readonly LayoutViolation[];
  selectedId: string | null;
  focusedIds: readonly string[];
  positionLocks: readonly string[];
  language: Language;
  editable: boolean;
  onSelect: (id: string) => void;
  onRoom: (id: string) => void;
  onPropose: (item: FlatFurniture) => void;
  focus: PlanRequest;
  reveal: PlanRequest;
  onFocusRoom: (id: string | null) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

const points = (polygon: readonly Position2D[]) => polygon.map((point) => `${point.x},${point.z}`).join(" ");
const BUTTON_ZOOM = 1.25;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 24;
const clientPoint = (event: { clientX: number; clientY: number }): Position2D => ({ x: event.clientX, z: event.clientY });

export function FloorPlan({ flat, furniture, baseline = [], issues, selectedId, focusedIds, positionLocks, language, editable, onSelect, onRoom, onPropose, focus, reveal, onFocusRoom, onGestureStart, onGestureEnd }: FloorPlanProps) {
  const drag = useRef<{ id: string; pointerId: number; start: Position2D; origin: Position2D } | null>(null);
  const pointers = useRef(new Map<number, Position2D>());
  const pan = useRef<{ pointerId: number; last: Position2D } | null>(null);
  const pinch = useRef<{ distance: number; centre: Position2D } | null>(null);
  const lastTap = useRef<{ time: number; point: Position2D; roomId: string } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { width, depth } = flat;
  const frame = useMemo(() => {
    const home = planHome({ width, depth });
    return { home, bounds: flatBounds({ width, depth }), limits: { home, minWidth: MIN_VIEW_WIDTH_CM } };
  }, [width, depth]);
  const roomView = (roomId: string | null): PlanBox => {
    const room = flat.rooms.find((entry) => entry.id === roomId);
    return room ? clampView(fitRoomView(room, ROOM_MARGIN_CM, frame.home.width / frame.home.height), frame.bounds) : frame.home;
  };
  const [view, setView] = useState(() => roomView(focus.id));
  const [appliedFocus, setAppliedFocus] = useState(focus.revision);
  const [appliedReveal, setAppliedReveal] = useState(reveal.revision);
  if (appliedFocus !== focus.revision) {
    setAppliedFocus(focus.revision);
    setView(roomView(focus.id));
  }
  if (appliedReveal !== reveal.revision) {
    setAppliedReveal(reveal.revision);
    const item = furniture.find((entry) => entry.id === reveal.id);
    if (item && isZoomed(view, frame.home)) setView(clampView(ensureVisible(view, rectanglePolygon(item)), frame.bounds));
  }
  const zoomed = isZoomed(view, frame.home);
  const k = view.width / frame.home.width;
  const colliding = new Set(issues.flatMap(issueItemIds));
  const highlights = issuePolygons(issues);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!zoomed && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const point = clientPoint(event);
      const factor = Math.exp(-Math.max(-0.5, Math.min(0.5, event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002))));
      setView((current) => clampView(zoomAt(current, factor, clientToPlan(point, bounds, current), frame.limits), frame.bounds));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomed, frame]);

  function zoomBy(factor: number) {
    setView((current) => clampView(zoomAt(current, factor, { x: current.minX + current.width / 2, z: current.minZ + current.height / 2 }, frame.limits), frame.bounds));
  }

  function pointerPoint(event: PointerEvent<SVGSVGElement>) {
    return clientToPlan(clientPoint(event), event.currentTarget.getBoundingClientRect(), view);
  }

  function measurePinch() {
    const [first, second] = [...pointers.current.values()];
    pinch.current = { distance: Math.hypot(first.x - second.x, first.z - second.z), centre: { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 } };
    return pinch.current;
  }

  function startPointer(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    pointers.current.set(event.pointerId, clientPoint(event));
    if (pointers.current.size === 2) {
      if (drag.current) {
        drag.current = null;
        onGestureEnd();
      }
      pan.current = null;
      lastTap.current = null;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      measurePinch();
      return;
    }
    const point = pointerPoint(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(bounds.width / view.width, bounds.height / view.height);
    const item = nearestPlanItem(furniture, point, 22 / scale);
    if (!item) {
      const room = containingRoom(flat, point);
      const tap = lastTap.current;
      if (room && tap && tap.roomId === room.id && event.timeStamp - tap.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - tap.point.x, event.clientY - tap.point.z) < DOUBLE_TAP_PX) {
        lastTap.current = null;
        onFocusRoom(room.id);
        return;
      }
      lastTap.current = room ? { time: event.timeStamp, point: clientPoint(event), roomId: room.id } : null;
      if (room) onRoom(room.id);
      if (zoomed) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pan.current = { pointerId: event.pointerId, last: clientPoint(event) };
      }
      return;
    }
    lastTap.current = null;
    onSelect(item.id);
    if (!editable || positionLocks.includes(item.id)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: item.id, pointerId: event.pointerId, start: point, origin: { ...item.position } };
    onGestureStart();
  }

  function movePointer(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = clientPoint(event);
    pointers.current.set(event.pointerId, point);
    const bounds = event.currentTarget.getBoundingClientRect();
    const previous = pinch.current;
    if (previous) {
      if (pointers.current.size < 2) return;
      event.preventDefault();
      const next = measurePinch();
      const factor = previous.distance > 1 ? next.distance / previous.distance : 1;
      setView((current) => {
        const from = clientToPlan(previous.centre, bounds, current);
        const to = clientToPlan(next.centre, bounds, current);
        const panned = { ...current, minX: current.minX + from.x - to.x, minZ: current.minZ + from.z - to.z };
        return clampView(zoomAt(panned, factor, clientToPlan(next.centre, bounds, panned), frame.limits), frame.bounds);
      });
      return;
    }
    const panning = pan.current;
    if (panning?.pointerId === event.pointerId) {
      event.preventDefault();
      pan.current = { pointerId: event.pointerId, last: point };
      setView((current) => {
        const from = clientToPlan(panning.last, bounds, current);
        const to = clientToPlan(point, bounds, current);
        return panBy(current, from.x - to.x, from.z - to.z, frame.bounds);
      });
      return;
    }
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !editable || positionLocks.includes(active.id)) return;
    const item = furniture.find((entry) => entry.id === active.id);
    if (!item) return;
    event.preventDefault();
    onPropose({ ...item, position: draggedPosition(active.origin, active.start, pointerPoint(event)) });
  }

  function endPointer(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      return;
    }
    if (pan.current?.pointerId === event.pointerId) pan.current = null;
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      onGestureEnd();
    }
  }

  return (
    <>
      <div className="room-focus-bar">
        <div className="camera-tools plan-zoom-tools">
          <button type="button" className="icon-button" disabled={view.width <= MIN_VIEW_WIDTH_CM + 1e-6} aria-label={translate(language, "scene.zoomIn")} title={translate(language, "scene.zoomIn")} data-tooltip={translate(language, "scene.zoomIn")} onClick={() => zoomBy(BUTTON_ZOOM)}><ZoomIn size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={!zoomed} aria-label={translate(language, "scene.zoomOut")} title={translate(language, "scene.zoomOut")} data-tooltip={translate(language, "scene.zoomOut")} onClick={() => zoomBy(1 / BUTTON_ZOOM)}><ZoomOut size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label={editorText(language, "plan.fit")} title={editorText(language, "plan.fit")} data-tooltip={editorText(language, "plan.fit")} onClick={() => onFocusRoom(null)}><Maximize size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="plan-stage" data-testid="plan-stage">
        <svg ref={svg} className="flat-plan" style={{ aspectRatio: `${frame.home.width} / ${frame.home.height}` }} viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.height}`} role="group" aria-label={editorText(language, "editor.plan")} data-testid="floor-plan" data-zoom={(1 / k).toFixed(2)} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>
          <defs><pattern id="plan-outside-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#d3d9d3" /><line x1="0" y1="0" x2="0" y2="12" stroke="#a9b3ac" strokeWidth="4" /></pattern></defs>
          <rect x="0" y="0" width={flat.width} height={flat.depth} fill="#e5eae4" />
          {flatVoids(flat).map((area, index) => <rect key={`void-${index}`} x={area.position.x - area.width / 2} y={area.position.z - area.depth / 2} width={area.width} height={area.depth} fill="url(#plan-outside-hatch)"><title>{editorText(language, "plan.outside")}</title></rect>)}
          {flat.rooms.map((room) => <rect key={room.id} x={room.position.x - room.width / 2} y={room.position.z - room.depth / 2} width={room.width} height={room.depth} fill="#f6f7f2" stroke="#d4ddd3" vectorEffect="non-scaling-stroke" />)}
          {wallParts(flat).map((wall) => <polygon key={wall.id} points={points(rectanglePolygon(wall))} fill="#6b756f" />)}
          {flat.windows.map((window) => {
            const wall = flat.walls.find((entry) => entry.id === window.wallId)!;
            const axis = wallAxis(wall);
            return <g key={window.id}><title>{`${window.name[language]} · ${formatCm(window.sillHeight, language)} ${editorText(language, "editor.unit")}`}</title><line x1={window.position.x - (axis === "x" ? window.width / 2 : 0)} y1={window.position.z - (axis === "z" ? window.width / 2 : 0)} x2={window.position.x + (axis === "x" ? window.width / 2 : 0)} y2={window.position.z + (axis === "z" ? window.width / 2 : 0)} stroke="#4d9fa9" strokeWidth="8" /></g>;
          })}
          {flat.doors.map((door) => {
            const geometry = doorGeometry(door, flat);
            return <g key={door.id} className="plan-door"><title>{`${door.name[language]} · ${door.width} ${editorText(language, "editor.unit")}`}</title><polygon points={points(rectanglePolygon(geometry.zone))} fill="#ead99c" fillOpacity="0.26" stroke="#9d7d2e" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /><path d={`M ${geometry.closedEnd.x} ${geometry.closedEnd.z} A ${door.width} ${door.width} 0 0 ${geometry.sweep} ${geometry.openEnd.x} ${geometry.openEnd.z}`} fill="none" stroke="#9d7d2e" strokeWidth="1.5" /><line x1={geometry.hinge.x} y1={geometry.hinge.z} x2={geometry.openEnd.x} y2={geometry.openEnd.z} stroke="#9d7d2e" strokeWidth="3" /></g>;
          })}
          {flat.rooms.map((room) => <text key={`name-${room.id}`} x={room.position.x - room.width / 2 + 12 * k} y={room.position.z - room.depth / 2 + 19 * k} className="plan-room-name" style={{ fontSize: 14 * k }}>{room.name[language]}</text>)}
          {editable && flat.rooms.filter((room) => !furniture.some((item) => item.roomId === room.id)).map((room) => <text key={`empty-${room.id}`} x={room.position.x} y={room.position.z} textAnchor="middle" dominantBaseline="middle" className="plan-empty-hint" style={{ fontSize: 13 * k }}>{editorText(language, "plan.empty")}</text>)}
          {baseline.map((item) => <polygon key={`baseline-${item.id}`} points={points(rectanglePolygon(item))} fill="none" stroke="#53675b" strokeWidth="2" strokeDasharray="5 4" opacity="0.28" vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          {furniture.map((item) => {
            const polygon = rectanglePolygon(item);
            const bounds = polygonBounds(polygon);
            const selected = selectedId === item.id;
            const focused = focusedIds.includes(item.id);
            return (
              <g key={item.id} data-item-id={item.id} data-testid={`plan-item-${item.id}`} role="button" tabIndex={0} aria-label={`${item.name[language]}${positionLocks.includes(item.id) ? ` · ${editorText(language, "locks.locked")}` : ""}`} aria-pressed={selected} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }}>
                <title>{`${item.name[language]} · ${formatCm(item.width, language)} × ${formatCm(item.depth, language)} ${editorText(language, "editor.unit")} · ${formatCm(item.orientation, language)}°`}</title>
                <polygon points={points(polygon)} fill={colliding.has(item.id) ? "#c7665b" : FURNITURE_COLORS[item.kind]} fillOpacity="0.86" stroke={selected || focused ? "#174c3d" : "#58635d"} strokeWidth={selected ? 4 : focused ? 3 : 1} vectorEffect="non-scaling-stroke" />
                {positionLocks.includes(item.id) && <LockKeyhole x={item.position.x - 9 * k} y={item.position.z - 9 * k} size={18 * k} color="#202c29" pointerEvents="none" aria-hidden="true" />}
                {selected && <rect x={bounds.minX - 3 * k} y={bounds.minZ - 3 * k} width={bounds.maxX - bounds.minX + 6 * k} height={bounds.maxZ - bounds.minZ + 6 * k} fill="none" stroke="#245f50" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
              </g>
            );
          })}
          {highlights.map((highlight) => <polygon key={highlight.id} points={points(highlight.polygon)} fill="#de3935" fillOpacity="0.55" stroke="#aa352d" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
          {highlights.map((highlight, index) => {
            const centre = polygonCentre(highlight.polygon);
            const text = `${formatCm(highlight.value, language)} ${editorText(language, "editor.unit")}`;
            const labelWidth = (text.length * 8 + 10) * k;
            const nearCount = highlights.slice(0, index).filter((other) => Math.hypot(polygonCentre(other.polygon).x - centre.x, polygonCentre(other.polygon).z - centre.z) < 45 * k).length;
            const z = centre.z - nearCount * 20 * k;
            return <g key={`label-${highlight.id}`} pointerEvents="none"><line x1={centre.x} y1={centre.z} x2={centre.x} y2={z} stroke="#aa352d" vectorEffect="non-scaling-stroke" /><rect x={centre.x - labelWidth / 2} y={z - 13 * k} width={labelWidth} height={19 * k} fill="#fff9f7" /><text x={centre.x} y={z + k} textAnchor="middle" className="plan-issue-value" style={{ fontSize: 13 * k }}>{text}</text></g>;
          })}
          {issues.filter((issue) => issue.code === "height").map((issue) => {
            const item = furniture.find((entry) => entry.id === issue.itemId);
            return item && <text key={issue.id} x={item.position.x} y={item.position.z} textAnchor="middle" className="plan-issue-value" style={{ fontSize: 13 * k }} pointerEvents="none">+{formatCm(issue.excess, language)} {editorText(language, "editor.unit")}</text>;
          })}
        </svg>
      </div>
      <p className="plan-hint">{editorText(language, "plan.zoomHint")}</p>
    </>
  );
}