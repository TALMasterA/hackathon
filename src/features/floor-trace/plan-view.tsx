"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { clampView, clientToPlan, panBy, zoomAt, type PlanBox } from "@/components/plan/interaction";
import type { Position2D } from "@/types/domain";
import { INK } from "@/lib/theme";

/**
 * A pointer tool: return true from `down` to take the pointer for a drag; otherwise the view pans,
 * and a press that barely moved is reported as a `tap`. Middle-button or Shift drags always pan.
 * `unit` is view units per CSS pixel, for hit-testing handles at a constant screen size.
 */
export interface PlanViewTool {
  down?: (point: Position2D, unit: number, event: PointerEvent<SVGSVGElement>) => boolean;
  move?: (point: Position2D, unit: number, event: PointerEvent<SVGSVGElement>) => void;
  up?: (point: Position2D, unit: number, event: PointerEvent<SVGSVGElement>) => void;
  tap?: (point: Position2D, unit: number) => void;
  /** The mouse moving with no button pressed, for previews; null once it leaves the picture. */
  hover?: (point: Position2D | null, unit: number) => void;
}

interface PlanViewProps {
  /** Content size in view units (source units or centimetres). */
  width: number;
  height: number;
  image?: string;
  label: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  fitLabel: string;
  /** How to move around, shown under the picture. */
  hint?: string;
  tool?: PlanViewTool;
  /** A box to show; a new object re-frames the view. */
  focus?: PlanBox | null;
  /** Overlays in view units; `unit` is view units per CSS pixel, for constant-size handles. */
  children?: (unit: number) => ReactNode;
  className?: string;
}

const BUTTON_ZOOM = 1.4;
/** A press that moves less than this many CSS pixels is a tap, not a pan. */
const TAP_SLOP_PX = 6;
const HOME_PADDING = 0.03;
const MAX_ZOOM = 400;
const clientPoint = (event: { clientX: number; clientY: number }): Position2D => ({ x: event.clientX, z: event.clientY });

/** A pannable, zoomable picture with overlays: wheel or pinch to zoom, drag to pan, tools take taps and drags. */
export function PlanView({ width, height, image, label, zoomInLabel, zoomOutLabel, fitLabel, hint, tool, focus, children, className }: PlanViewProps) {
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Position2D>());
  const pan = useRef<{ pointerId: number; last: Position2D; start: Position2D; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; centre: Position2D } | null>(null);
  const toolPointer = useRef<number | null>(null);
  const frame = useMemo(() => {
    const padding = Math.max(width, height) * HOME_PADDING;
    const home = { minX: -padding, minZ: -padding, width: width + padding * 2, height: height + padding * 2 };
    return { home, bounds: { minX: 0, minZ: 0, width, height }, limits: { home, minWidth: Math.max(width, height) / MAX_ZOOM } };
  }, [width, height]);
  const [view, setView] = useState<PlanBox>(frame.home);
  const [shownFrame, setShownFrame] = useState(frame);
  const [shownFocus, setShownFocus] = useState(focus);
  const [pixels, setPixels] = useState({ width: 800, height: 600 });
  if (shownFrame !== frame) {
    setShownFrame(frame);
    setView(frame.home);
  }
  if (shownFocus !== focus) {
    setShownFocus(focus);
    if (focus) setView(clampView({ ...focus }, frame.bounds));
  }

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      setPixels({ width: bounds.width || 800, height: bounds.height || 600 });
    });
    observer.observe(element);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const factor = Math.exp(-Math.max(-0.5, Math.min(0.5, event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002))));
      setView((current) => clampView(zoomAt(current, factor, clientToPlan(clientPoint(event), bounds, current), frame.limits), frame.bounds));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
    };
  }, [frame]);

  // The view box is fitted inside the element (xMidYMid meet), so the tighter axis sets the scale.
  const unit = Math.max(view.width / Math.max(1, pixels.width), view.height / Math.max(1, pixels.height));
  const toPlan = (event: PointerEvent<SVGSVGElement>) => clientToPlan(clientPoint(event), event.currentTarget.getBoundingClientRect(), view);
  const zoomBy = (factor: number) => setView((current) => clampView(zoomAt(current, factor, { x: current.minX + current.width / 2, z: current.minZ + current.height / 2 }, frame.limits), frame.bounds));

  function measurePinch() {
    const [first, second] = [...pointers.current.values()];
    pinch.current = { distance: Math.hypot(first.x - second.x, first.z - second.z), centre: { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 } };
    return pinch.current;
  }

  function down(event: PointerEvent<SVGSVGElement>) {
    if ((event.button !== 0 && event.button !== 1) || pointers.current.size >= 2) return;
    const panOnly = event.button === 1 || event.shiftKey;
    if (panOnly) event.preventDefault();
    pointers.current.set(event.pointerId, clientPoint(event));
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      // A second finger turns any drag into a pinch.
      if (toolPointer.current !== null) tool?.up?.(toPlan(event), unit, event);
      toolPointer.current = null;
      pan.current = null;
      measurePinch();
      return;
    }
    if (!panOnly && tool?.down?.(toPlan(event), unit, event)) {
      toolPointer.current = event.pointerId;
      return;
    }
    pan.current = { pointerId: event.pointerId, last: clientPoint(event), start: clientPoint(event), moved: panOnly };
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) {
      if (event.pointerType === "mouse") tool?.hover?.(toPlan(event), unit);
      return;
    }
    const point = clientPoint(event);
    pointers.current.set(event.pointerId, point);
    const bounds = event.currentTarget.getBoundingClientRect();
    const previous = pinch.current;
    if (previous) {
      if (pointers.current.size < 2) return;
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
    if (toolPointer.current === event.pointerId) {
      tool?.move?.(toPlan(event), unit, event);
      return;
    }
    const panning = pan.current;
    if (panning?.pointerId === event.pointerId) {
      pan.current = { ...panning, last: point, moved: panning.moved || Math.hypot(point.x - panning.start.x, point.z - panning.start.z) > TAP_SLOP_PX };
      setView((current) => {
        const from = clientToPlan(panning.last, bounds, current);
        const to = clientToPlan(point, bounds, current);
        return panBy(current, from.x - to.x, from.z - to.z, frame.bounds);
      });
    }
  }

  function up(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      return;
    }
    if (toolPointer.current === event.pointerId) {
      toolPointer.current = null;
      tool?.up?.(toPlan(event), unit, event);
    }
    const panning = pan.current;
    if (panning?.pointerId === event.pointerId) {
      pan.current = null;
      if (!panning.moved) tool?.tap?.(toPlan(event), unit);
    }
  }

  return (
    <div className={`plan-view ${className ?? ""}`}>
      <div className="camera-tools plan-view-tools">
        <button type="button" className="icon-button" aria-label={zoomInLabel} title={zoomInLabel} onClick={() => zoomBy(BUTTON_ZOOM)}><ZoomIn size={18} aria-hidden="true" /></button>
        <button type="button" className="icon-button" aria-label={zoomOutLabel} title={zoomOutLabel} onClick={() => zoomBy(1 / BUTTON_ZOOM)}><ZoomOut size={18} aria-hidden="true" /></button>
        <button type="button" className="icon-button" aria-label={fitLabel} title={fitLabel} onClick={() => setView(frame.home)}><Maximize size={18} aria-hidden="true" /></button>
      </div>
      <svg ref={svg} className="plan-view-canvas" viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.height}`} role="group" aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => tool?.hover?.(null, unit)}>
        <rect x={frame.home.minX} y={frame.home.minZ} width={frame.home.width} height={frame.home.height} fill={INK.stock} />
        {image && <image href={image} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
        {children?.(unit)}
      </svg>
      {hint && <p className="plan-view-hint">{hint}</p>}
    </div>
  );
}
