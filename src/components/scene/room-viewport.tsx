"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { translate } from "@/i18n/dictionary";
import type { SceneView } from "@/features/fit-check/state";
import { CANDIDATE_COLOR, FURNITURE_COLORS, RESERVED_COLOR } from "./palette";
import type { CameraCommand, RoomSceneProps } from "./room-scene";
import { SceneErrorBoundary } from "./scene-error-boundary";

const RoomScene = dynamic(() => import("./room-scene"), { ssr: false, loading: () => <div className="scene-loading"><LoaderCircle className="loading-icon" size={28} aria-hidden="true" /></div> });

type RoomViewportProps = Omit<RoomSceneProps, "cameraCommand"> & { onView: (view: SceneView) => void };

export function RoomViewport(props: RoomViewportProps) {
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ action: "reset", sequence: 0 });
  const { language, view, candidate, furniture, selectedId, onView } = props;
  const text = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const displayedSofa = view === "after" && candidate ? candidate : furniture.find((item) => item.id === selectedId);
  const cameraAction = (action: CameraCommand["action"]) => setCameraCommand((previous) => ({ action, sequence: previous.sequence + 1 }));

  return (
    <>
      <div className="scene-stage" role="region" aria-label={text("scene.label")} data-testid="scene-stage" data-view={view} data-sofa-width={displayedSofa?.width} data-sofa-depth={displayedSofa?.depth} data-sofa-height={displayedSofa?.height}>
        <SceneErrorBoundary fallback={<div className="scene-fallback" role="status">{text("scene.unavailable")}</div>}>
          <RoomScene {...props} cameraCommand={cameraCommand} />
        </SceneErrorBoundary>
        <div className="scene-toolbar">
          <div className="segmented comparison-switch" role="group" aria-label={text("scene.comparison")}>
            <button type="button" aria-pressed={view === "before"} onClick={() => onView("before")}>{text("scene.before")}</button>
            <button type="button" aria-pressed={view === "after"} disabled={!candidate} title={!candidate ? text("scene.afterLocked") : text("scene.after")} onClick={() => onView("after")}>{text("scene.after")}</button>
          </div>
          <div className="camera-tools">
            <button type="button" className="icon-button" aria-label={text("scene.zoomIn")} title={text("scene.zoomIn")} data-tooltip={text("scene.zoomIn")} onClick={() => cameraAction("in")}><ZoomIn size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={text("scene.zoomOut")} title={text("scene.zoomOut")} data-tooltip={text("scene.zoomOut")} onClick={() => cameraAction("out")}><ZoomOut size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={text("scene.reset")} title={text("scene.reset")} data-tooltip={text("scene.reset")} onClick={() => cameraAction("reset")}><RotateCcw size={18} aria-hidden="true" /></button>
          </div>
        </div>
        <span className="scene-view-label">{view === "before" ? text("scene.before") : text("scene.after")}</span>
      </div>
      <ul className="scene-legend" aria-label={text("scene.legend")}>
        {furniture.map((item) => {
          const replaced = view === "after" && candidate?.replacesId === item.id;
          return <li key={item.id}><span className="legend-swatch" style={{ backgroundColor: replaced ? CANDIDATE_COLOR : FURNITURE_COLORS[item.kind] }} />{replaced ? text("scene.candidate") : item.name[language]}</li>;
        })}
        <li><span className="legend-swatch zone-swatch" style={{ borderColor: RESERVED_COLOR }} />{text("scene.zones")}</li>
      </ul>
    </>
  );
}