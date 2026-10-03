"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, Html, OrbitControls, OrthographicCamera as OrthoCamera } from "@react-three/drei";
import { DoubleSide, OrthographicCamera, Shape, Vector2, Vector3 } from "three";
import type { EditorSceneProps } from "@/features/flat-editor/workspace";
import { formatCm } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { doorGeometry, flatVoids, wallDirection, wallPanels, wallParts } from "@/lib/geometry/architecture";
import { issueItemIds, issuePolygons } from "@/lib/geometry/layout";
import { floorTrianglePositions, polygonCentre, rectanglePolygon, scenePositionCm, threeRotation } from "@/lib/geometry/oriented";
import type { Look } from "@/features/model-looks/looks";
import type { Flat, FlatFurniture, Position2D } from "@/types/domain";
import { cameraDistanceLimits, orthographicFitZoom, roomCameraFrame, setOrthographicZoom, WHOLE_FLAT_TARGET } from "./camera";
import { FurnitureMesh } from "./furniture-mesh";
import type { FurnitureAppearance } from "./furniture-models";
import { RESERVED_COLOR, SCENE_BACKGROUND } from "./palette";

export interface CameraCommand {
  action: "reset" | "in" | "out" | "focus";
  sequence: number;
}

export interface RoomSceneProps extends EditorSceneProps {
  cameraCommand: CameraCommand;
  appearance: FurnitureAppearance;
}

function CameraControls({ command, flat, focusRoomId }: { command: CameraCommand; flat: Flat; focusRoomId: string | null }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate, size } = useThree();
  const lastCommand = useRef<CameraCommand | null>(null);
  const appliedPerspectiveFrame = useRef<string | null>(null);
  const zoomMultiplier = useRef(1);
  const room = flat.rooms.find((entry) => entry.id === focusRoomId) ?? null;
  const limits = cameraDistanceLimits(room, flat);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    if (!(camera instanceof OrthographicCamera)) {
      const frameKey = `${camera.uuid}:${command.action}:${command.sequence}:${room?.id}:${flat.width}:${flat.depth}`;
      if (appliedPerspectiveFrame.current === frameKey) return;
      appliedPerspectiveFrame.current = frameKey;
    }
    const dampingEnabled = control.enableDamping;
    control.enableDamping = false;
    control.update();
    if (camera instanceof OrthographicCamera) {
      const changed = lastCommand.current !== command;
      lastCommand.current = command;
      if (changed) zoomMultiplier.current = command.action === "in" ? Math.min(8, zoomMultiplier.current * 1.22) : command.action === "out" ? Math.max(0.3, zoomMultiplier.current / 1.22) : 1;
      const target = room ? scenePositionCm(room.position, { width: flat.width, depth: flat.depth }) : [0, 0, 0];
      const direction = command.action === "reset" ? new Vector3(1, 1.2, 1).normalize() : camera.position.clone().sub(control.target).normalize();
      control.target.set(target[0], flat.height / 200, target[2]);
      camera.position.copy(control.target).add(direction.clone().multiplyScalar(20));
      setOrthographicZoom(camera, orthographicFitZoom({ width: room?.width ?? flat.width, depth: room?.depth ?? flat.depth, height: flat.height }, size, direction.toArray()) * zoomMultiplier.current);
    } else if (command.action === "in" || command.action === "out") {
      const offset = camera.position.clone().sub(control.target);
      const nextDistance = Math.min(control.maxDistance, Math.max(control.minDistance, offset.length() * (command.action === "in" ? 0.82 : 1.22)));
      camera.position.copy(control.target).add(offset.setLength(nextDistance));
    } else {
      const direction = command.action === "focus" ? camera.position.clone().sub(control.target).toArray() : undefined;
      const frame = roomCameraFrame(room, { width: flat.width, depth: flat.depth }, direction);
      camera.position.set(...frame.position);
      control.target.set(...frame.target);
    }
    control.update();
    control.enableDamping = dampingEnabled;
    invalidate();
  }, [command, room, flat.width, flat.depth, flat.height, camera, invalidate, size]);

  const orthographic = isPdfPreset(flat);
  return <OrbitControls ref={controls} makeDefault target={WHOLE_FLAT_TARGET} enablePan={false} enableDamping minDistance={orthographic ? 2 : limits.min} maxDistance={orthographic ? 40 : limits.max} minZoom={1} maxZoom={1000} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.05} minAzimuthAngle={orthographic ? -Infinity : Math.PI * 0.75} maxAzimuthAngle={orthographic ? Infinity : Math.PI * 1.25} />;
}

function FloorPolygon({ polygon, flat, color, opacity, elevation = 0.012 }: { polygon: readonly Position2D[]; flat: Flat; color: string; opacity: number; elevation?: number }) {
  const positions = floorTrianglePositions(polygon, flat, elevation);
  return positions.length > 0 && <mesh><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} /></mesh>;
}

/**
 * The built-in PDF-derived preset (Harmony) keeps its own look: an orthographic camera, neutral editing
 * areas instead of room floors, and darker walls. A traced flat with an outline keeps the editor's look.
 */
function isPdfPreset(flat: Flat): boolean {
  return Boolean(flat.source);
}

function RoomShell({ flat }: { flat: Flat }) {
  const preset = isPdfPreset(flat);
  const floorShape = flat.outline ? new Shape(flat.outline.map((point) => { const [x, , z] = scenePositionCm(point, flat); return new Vector2(x, -z); })) : null;
  const panels = flat.outline ? wallPanels(flat) : wallParts(flat).map((wall) => ({ ...wall, bottom: 0, height: flat.height }));
  return (
    <group name="room-shell">
      {floorShape ? <mesh name="polygon-floor" position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}><extrudeGeometry args={[floorShape, { depth: 0.1, bevelEnabled: false }]} /><meshStandardMaterial color="#f4f6ef" roughness={1} /><Edges color="#a5b4a9" /></mesh> : <mesh position={[0, -0.04, 0]}><boxGeometry args={[flat.width / 100, 0.08, flat.depth / 100]} /><meshStandardMaterial color="#cdd9d0" roughness={1} /><Edges color="#a5b4a9" /></mesh>}
      {!preset && flat.rooms.map((room) => <FloorPolygon key={room.id} polygon={room.outline ?? rectanglePolygon(room)} flat={flat} color="#ecf0e8" opacity={0.85} elevation={0.002} />)}
      {flatVoids(flat).map((area, index) => <FloorPolygon key={`void-${index}`} polygon={rectanglePolygon(area)} flat={flat} color="#7d8a82" opacity={0.6} elevation={0.003} />)}
      {panels.map((wall) => {
        const [x, , z] = scenePositionCm(wall.position, flat);
        return <mesh key={wall.id} name={wall.id} position={[x, (wall.bottom + wall.height / 2) / 100, z]} rotation={[0, threeRotation(wall.orientation), 0]}><boxGeometry args={[wall.width / 100, wall.height / 100, wall.depth / 100]} /><meshStandardMaterial color={preset ? "#6f7a73" : wall.outer ? "#cfd9d2" : "#d8dfd5"} transparent opacity={preset ? 0.18 : wall.outer ? 0.22 : 0.38} roughness={1} depthWrite={false} /><Edges color="#a8b6aa" /></mesh>;
      })}
      {flat.windows.map((window) => {
        const wall = flat.walls.find((entry) => entry.id === window.wallId)!;
        const direction = wallDirection(wall);
        const [x, , z] = scenePositionCm(window.position, flat);
        return <mesh key={window.id} name={window.id} position={[x, (window.sillHeight + window.height / 2) / 100, z]} rotation={[0, threeRotation(Math.atan2(direction.z, direction.x) * 180 / Math.PI), 0]}><boxGeometry args={[window.width / 100, window.height / 100, 0.025]} /><meshBasicMaterial color={preset ? "#67a9b4" : "#70a6b2"} transparent opacity={0.55} depthWrite={false} /><Edges color="#568c98" /></mesh>;
      })}
      {flat.doors.map((door) => {
        const geometry = doorGeometry(door, flat);
        const hinge = scenePositionCm(geometry.hinge, flat);
        const angle = Math.atan2(geometry.normal.z, geometry.normal.x) * 180 / Math.PI;
        const height = door.height ?? 200;
        return <group key={door.id} name={door.id}><FloorPolygon polygon={rectanglePolygon(geometry.zone)} flat={flat} color={RESERVED_COLOR} opacity={0.2} elevation={0.005} /><group position={hinge} rotation={[0, threeRotation(angle), 0]}><mesh position={[door.width / 200, height / 200, 0]}><boxGeometry args={[door.width / 100, height / 100, 0.02]} /><meshStandardMaterial color={preset ? "#a18738" : "#b5a273"} transparent opacity={0.3} depthWrite={false} /><Edges color="#a39060" /></mesh></group></group>;
      })}
    </group>
  );
}

function FurnitureModel({ item, flat, selected, colliding, appearance, look, onSelect }: { item: FlatFurniture; flat: Flat; selected: boolean; colliding: boolean; appearance: FurnitureAppearance; look?: Look; onSelect: (id: string) => void }) {
  return (
    <group name={item.id} position={scenePositionCm(item.position, flat)} rotation={[0, threeRotation(item.orientation), 0]} onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
      <FurnitureMesh item={item} selected={selected} colliding={colliding} appearance={appearance} look={look} />
    </group>
  );
}

export default function RoomScene({ flat, furniture, baseline, issues, selectedId, focusedIds, focusRoomId, language, looks, cameraCommand, appearance, onSelect }: RoomSceneProps) {
  const colliding = new Set(issues.flatMap(issueItemIds));
  const highlights = issuePolygons(issues);
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: roomCameraFrame(null, flat).position, fov: 40, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}>
      {isPdfPreset(flat) && <OrthoCamera makeDefault position={[12, 14, 14]} near={0.1} far={80} />}
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-3, 9, -5]} intensity={2} />
      <RoomShell flat={flat} />
      {baseline.map((item) => {
        const [x, , z] = scenePositionCm(item.position, flat);
        return <mesh key={`baseline-${item.id}`} name={`baseline-${item.id}`} position={[x, 0.01, z]} rotation={[0, threeRotation(item.orientation), 0]}><boxGeometry args={[item.width / 100, 0.004, item.depth / 100]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color="#53675b" transparent opacity={0.28} /></mesh>;
      })}
      {furniture.map((item) => <FurnitureModel key={item.id} item={item} flat={flat} selected={selectedId === item.id || focusedIds.includes(item.id)} colliding={colliding.has(item.id)} appearance={appearance} look={looks?.get(item.id)} onSelect={onSelect} />)}
      {highlights.map((highlight, index) => {
        const centre = polygonCentre(highlight.polygon);
        const [x, , z] = scenePositionCm(centre, flat);
        const nearCount = highlights.slice(0, index).filter((other) => Math.hypot(polygonCentre(other.polygon).x - centre.x, polygonCentre(other.polygon).z - centre.z) < 45).length;
        return <group key={highlight.id}><FloorPolygon polygon={highlight.polygon} flat={flat} color="#e33e35" opacity={0.65} elevation={0.012 + index * 0.00005} />{highlight.value !== null && <Html position={[x, 0.05 + nearCount * 0.18, z]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><span className="scene-issue-label">{formatCm(highlight.value, language)} {editorText(language, "editor.unit")}</span></Html>}</group>;
      })}
      {issues.filter((issue) => issue.code === "height").map((issue) => {
        const item = furniture.find((entry) => entry.id === issue.itemId);
        if (!item) return null;
        const [x, , z] = scenePositionCm(item.position, flat);
        return <Html key={issue.id} position={[x, item.height / 100 + 0.12, z]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><span className="scene-issue-label">+{formatCm(issue.excess, language)} {editorText(language, "editor.unit")}</span></Html>;
      })}
      <CameraControls command={cameraCommand} flat={flat} focusRoomId={focusRoomId} />
    </Canvas>
  );
}