"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { translate } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import type { EditorSceneProps } from "@/features/flat-editor/workspace";
import type { CameraCommand } from "./room-scene";
import { SceneErrorBoundary } from "./scene-error-boundary";

const RoomScene = dynamic(() => import("./room-scene"), { ssr: false, loading: () => <div className="scene-loading"><LoaderCircle className="loading-icon" size={28} aria-hidden="true" /></div> });

export function RoomViewport(props: EditorSceneProps) {
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ action: "reset", sequence: 0 });
  const { language } = props;
  const text = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const cameraAction = (action: CameraCommand["action"]) => setCameraCommand((previous) => ({ action, sequence: previous.sequence + 1 }));

  return (
    <>
      <div className="scene-stage flat-scene-stage" role="region" aria-label={editorText(language, "editor.scene")} data-testid="scene-stage" data-items={props.furniture.length}>
        <SceneErrorBoundary fallback={<div className="scene-fallback" role="status">{text("scene.unavailable")}</div>}>
          <RoomScene {...props} cameraCommand={cameraCommand} />
        </SceneErrorBoundary>
        <div className="scene-toolbar">
          <div className="camera-tools">
            <button type="button" className="icon-button" aria-label={text("scene.zoomIn")} title={text("scene.zoomIn")} data-tooltip={text("scene.zoomIn")} onClick={() => cameraAction("in")}><ZoomIn size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={text("scene.zoomOut")} title={text("scene.zoomOut")} data-tooltip={text("scene.zoomOut")} onClick={() => cameraAction("out")}><ZoomOut size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={text("scene.reset")} title={text("scene.reset")} data-tooltip={text("scene.reset")} onClick={() => cameraAction("reset")}><RotateCcw size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
    </>
  );
}