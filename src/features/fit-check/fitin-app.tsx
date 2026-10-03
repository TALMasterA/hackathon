"use client";

import { RoomViewport } from "@/components/scene/room-viewport";
import { FlatEditorApp } from "@/features/flat-editor/workspace";

export function FitInApp() {
  return <FlatEditorApp SceneViewport={RoomViewport} />;
}