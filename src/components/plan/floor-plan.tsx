"use client";

import { useRef, type PointerEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { FURNITURE_COLORS } from "@/components/scene/palette";
import { formatCm } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { containingRoom, doorGeometry, wallAxis, wallParts } from "@/lib/geometry/architecture";
import { issueItemIds, issuePolygons } from "@/lib/geometry/layout";
import { polygonBounds, polygonCentre, rectanglePolygon } from "@/lib/geometry/oriented";
import type { Flat, FlatFurniture, Language, LayoutViolation, Position2D } from "@/types/domain";
import { clientToPlan, draggedPosition, nearestPlanItem } from "./interaction";

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
}

const points = (polygon: readonly Position2D[]) => polygon.map((point) => `${point.x},${point.z}`).join(" ");

export function FloorPlan({ flat, furniture, baseline = [], issues, selectedId, focusedIds, positionLocks, language, editable, onSelect, onRoom, onPropose }: FloorPlanProps) {
  const drag = useRef<{ id: string; pointerId: number; start: Position2D; origin: Position2D } | null>(null);
  const box = { minX: -20, minZ: -20, width: flat.width + 40, height: flat.depth + 40 };
  const colliding = new Set(issues.flatMap(issueItemIds));
  const highlights = issuePolygons(issues);

  function pointerPoint(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clientToPlan({ x: event.clientX, z: event.clientY }, bounds, box);
  }

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || drag.current) return;
    const point = pointerPoint(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(bounds.width / box.width, bounds.height / box.height);
    const item = nearestPlanItem(furniture, point, 22 / scale);
    if (!item) {
      const room = containingRoom(flat, point);
      if (room) onRoom(room.id);
      return;
    }
    onSelect(item.id);
    if (!editable || positionLocks.includes(item.id)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: item.id, pointerId: event.pointerId, start: point, origin: { ...item.position } };
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !editable || positionLocks.includes(active.id)) return;
    const item = furniture.find((entry) => entry.id === active.id);
    if (!item) return;
    event.preventDefault();
    onPropose({ ...item, position: draggedPosition(active.origin, active.start, pointerPoint(event)) });
  }

  function stopDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }

  return (
    <div className="plan-stage" data-testid="plan-stage">
      <svg className="flat-plan" style={{ aspectRatio: `${box.width} / ${box.height}` }} viewBox={`${box.minX} ${box.minZ} ${box.width} ${box.height}`} role="group" aria-label={editorText(language, "editor.plan")} data-testid="floor-plan" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
        <rect x="0" y="0" width={flat.width} height={flat.depth} fill="#e5eae4" />
        {flat.rooms.map((room) => <rect key={room.id} x={room.position.x - room.width / 2} y={room.position.z - room.depth / 2} width={room.width} height={room.depth} fill="#f6f7f2" stroke="#d4ddd3" />)}
        {wallParts(flat).map((wall) => <polygon key={wall.id} points={points(rectanglePolygon(wall))} fill="#6b756f" />)}
        {flat.windows.map((window) => {
          const wall = flat.walls.find((entry) => entry.id === window.wallId)!;
          const axis = wallAxis(wall);
          return <g key={window.id}><title>{window.name[language]} · {formatCm(window.sillHeight, language)} {editorText(language, "editor.unit")}</title><line x1={window.position.x - (axis === "x" ? window.width / 2 : 0)} y1={window.position.z - (axis === "z" ? window.width / 2 : 0)} x2={window.position.x + (axis === "x" ? window.width / 2 : 0)} y2={window.position.z + (axis === "z" ? window.width / 2 : 0)} stroke="#4d9fa9" strokeWidth="8" /></g>;
        })}
        {flat.doors.map((door) => {
          const geometry = doorGeometry(door, flat);
          return <g key={door.id} className="plan-door"><title>{door.name[language]} · {door.width} {editorText(language, "editor.unit")}</title><polygon points={points(rectanglePolygon(geometry.zone))} fill="#ead99c" fillOpacity="0.26" stroke="#9d7d2e" strokeWidth="1" strokeDasharray="4 3" /><path d={`M ${geometry.closedEnd.x} ${geometry.closedEnd.z} A ${door.width} ${door.width} 0 0 ${geometry.sweep} ${geometry.openEnd.x} ${geometry.openEnd.z}`} fill="none" stroke="#9d7d2e" strokeWidth="1.5" /><line x1={geometry.hinge.x} y1={geometry.hinge.z} x2={geometry.openEnd.x} y2={geometry.openEnd.z} stroke="#9d7d2e" strokeWidth="3" /></g>;
        })}
        {flat.rooms.map((room) => <text key={`name-${room.id}`} x={room.position.x - room.width / 2 + 12} y={room.position.z - room.depth / 2 + 19} className="plan-room-name">{room.name[language]}</text>)}
        {baseline.map((item) => <polygon key={`baseline-${item.id}`} points={points(rectanglePolygon(item))} fill="none" stroke="#53675b" strokeWidth="2" strokeDasharray="5 4" opacity="0.28" pointerEvents="none" />)}
        {furniture.map((item) => {
          const polygon = rectanglePolygon(item);
          const bounds = polygonBounds(polygon);
          const selected = selectedId === item.id;
          const focused = focusedIds.includes(item.id);
          return (
            <g key={item.id} data-item-id={item.id} data-testid={`plan-item-${item.id}`} role="button" tabIndex={0} aria-label={`${item.name[language]}${positionLocks.includes(item.id) ? ` · ${editorText(language, "locks.locked")}` : ""}`} aria-pressed={selected} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }}>
              <title>{item.name[language]} · {formatCm(item.width, language)} × {formatCm(item.depth, language)} {editorText(language, "editor.unit")} · {formatCm(item.orientation, language)}°</title>
              <polygon points={points(polygon)} fill={colliding.has(item.id) ? "#c7665b" : FURNITURE_COLORS[item.kind]} fillOpacity="0.86" stroke={selected || focused ? "#174c3d" : "#58635d"} strokeWidth={selected ? 4 : focused ? 3 : 1} />
              {positionLocks.includes(item.id) && <LockKeyhole x={item.position.x - 9} y={item.position.z - 9} size={18} color="#202c29" pointerEvents="none" aria-hidden="true" />}
              {selected && <rect x={bounds.minX - 3} y={bounds.minZ - 3} width={bounds.maxX - bounds.minX + 6} height={bounds.maxZ - bounds.minZ + 6} fill="none" stroke="#245f50" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />}
            </g>
          );
        })}
        {highlights.map((highlight) => <polygon key={highlight.id} points={points(highlight.polygon)} fill="#de3935" fillOpacity="0.55" stroke="#aa352d" strokeWidth="1" pointerEvents="none" />)}
        {highlights.map((highlight, index) => {
          const centre = polygonCentre(highlight.polygon);
          const text = `${formatCm(highlight.value, language)} ${editorText(language, "editor.unit")}`;
          const labelWidth = text.length * 8 + 10;
          const nearCount = highlights.slice(0, index).filter((other) => Math.hypot(polygonCentre(other.polygon).x - centre.x, polygonCentre(other.polygon).z - centre.z) < 45).length;
          const z = centre.z - nearCount * 20;
          return <g key={`label-${highlight.id}`} pointerEvents="none"><line x1={centre.x} y1={centre.z} x2={centre.x} y2={z} stroke="#aa352d" /><rect x={centre.x - labelWidth / 2} y={z - 13} width={labelWidth} height="19" fill="#fff9f7" /><text x={centre.x} y={z + 1} textAnchor="middle" className="plan-issue-value">{text}</text></g>;
        })}
        {issues.filter((issue) => issue.code === "height").map((issue) => {
          const item = furniture.find((entry) => entry.id === issue.itemId);
          return item && <text key={issue.id} x={item.position.x} y={item.position.z} textAnchor="middle" className="plan-issue-value" pointerEvents="none">+{formatCm(issue.excess, language)} {editorText(language, "editor.unit")}</text>;
        })}
      </svg>
    </div>
  );
}