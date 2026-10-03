"use client";

import { useRef, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { normalizeAngle, rotationFromPoint } from "@/lib/geometry/oriented";
import type { Language } from "@/types/domain";

export function RotationDial({ angle, language, disabled, onRotate, onGestureStart, onGestureEnd }: { angle: number; language: Language; disabled: boolean; onRotate: (angle: number) => void; onGestureStart?: () => void; onGestureEnd?: () => void }) {
  const activePointer = useRef<number | null>(null);
  const radians = angle * Math.PI / 180;

  function setFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centre = { x: bounds.left + bounds.width / 2, z: bounds.top + bounds.height / 2 };
    const point = { x: event.clientX, z: event.clientY };
    if (Math.hypot(point.x - centre.x, point.z - centre.z) < 8) return;
    onRotate(normalizeAngle(Number(rotationFromPoint(point, centre).toFixed(6))));
  }

  function stop(event: PointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointer.current = null;
    onGestureEnd?.();
  }

  return (
    <div className="rotation-control">
      <div className="rotation-dial" role="slider" tabIndex={disabled ? -1 : 0} aria-label={editorText(language, "editor.rotation")} aria-valuemin={0} aria-valuemax={359.999999} aria-valuenow={angle} aria-valuetext={`${formatCm(angle, language)}°`} aria-disabled={disabled} onPointerDown={(event) => { if (disabled || activePointer.current !== null || event.button !== 0) return; event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); onGestureStart?.(); setFromPointer(event); }} onPointerMove={(event) => { if (activePointer.current === event.pointerId && !disabled) { event.preventDefault(); setFromPointer(event); } }} onPointerUp={stop} onPointerCancel={stop} onKeyDown={(event) => {
        if (disabled) return;
        const amount = event.shiftKey ? 10 : 1;
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (direction || event.key === "Home" || event.key === "End") { event.preventDefault(); onRotate(event.key === "Home" ? 0 : event.key === "End" ? 359 : normalizeAngle(angle + direction * amount)); }
      }}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="37" fill="#f1f5f0" stroke="#b2c5b9" strokeWidth="2" /><line x1="50" y1="50" x2={50 + 31 * Math.cos(radians)} y2={50 + 31 * Math.sin(radians)} stroke="#245f50" strokeWidth="3" /><circle cx={50 + 37 * Math.cos(radians)} cy={50 + 37 * Math.sin(radians)} r="6" fill="#245f50" /><text x="50" y="54" textAnchor="middle">{formatCm(Number(angle.toFixed(1)), language)}°</text></svg>
      </div>
      <button type="button" className="icon-button" disabled={disabled} aria-label={editorText(language, "editor.resetAngle")} title={editorText(language, "editor.resetAngle")} data-tooltip={editorText(language, "editor.resetAngle")} onClick={() => onRotate(0)}><RotateCcw size={18} aria-hidden="true" /></button>
    </div>
  );
}