"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, Html, OrbitControls } from "@react-three/drei";
import { DoubleSide } from "three";
import type { EditorSceneProps } from "@/features/flat-editor/workspace";
import { formatCm } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { doorGeometry, wallAxis, wallParts } from "@/lib/geometry/architecture";
import { issueItemIds, issuePolygons } from "@/lib/geometry/layout";
import { floorTrianglePositions, polygonCentre, rectanglePolygon, scenePositionCm, threeRotation } from "@/lib/geometry/oriented";
import type { Flat, FlatFurniture, Position2D } from "@/types/domain";
import { FURNITURE_COLORS, METRES_PER_CM, RESERVED_COLOR, SCENE_BACKGROUND } from "./palette";
import { SofaModel } from "./sofa-model";

const INITIAL_CAMERA_POSITION: [number, number, number] = [8.5, 10, -11.5];

export interface CameraCommand {
  action: "reset" | "in" | "out";
  sequence: number;
}

export interface RoomSceneProps extends EditorSceneProps {
  cameraCommand: CameraCommand;
}

function CameraControls({ command }: { command: CameraCommand }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const dampingEnabled = control.enableDamping;
    control.enableDamping = false;
    control.update();
    if (command.action === "reset") {
      camera.position.set(...INITIAL_CAMERA_POSITION);
      control.target.set(0, 0.6, 0);
    } else {
      const offset = camera.position.clone().sub(control.target);
      const nextDistance = Math.min(22, Math.max(6, offset.length() * (command.action === "in" ? 0.82 : 1.22)));
      camera.position.copy(control.target).add(offset.setLength(nextDistance));
    }
    control.update();
    control.enableDamping = dampingEnabled;
    invalidate();
  }, [command, camera, invalidate]);

  return <OrbitControls ref={controls} makeDefault target={[0, 0.6, 0]} enablePan={false} enableDamping minDistance={6} maxDistance={22} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.05} minAzimuthAngle={Math.PI * 0.75} maxAzimuthAngle={Math.PI * 1.25} />;
}

function FloorPolygon({ polygon, flat, color, opacity, elevation = 0.012 }: { polygon: readonly Position2D[]; flat: Flat; color: string; opacity: number; elevation?: number }) {
  const positions = floorTrianglePositions(polygon, flat, elevation);
  return positions.length > 0 && <mesh><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} /></mesh>;
}

function RoomShell({ flat }: { flat: Flat }) {
  return (
    <group name="room-shell">
      <mesh position={[0, -0.04, 0]}><boxGeometry args={[flat.width / 100, 0.08, flat.depth / 100]} /><meshStandardMaterial color="#cdd9d0" roughness={1} /><Edges color="#a5b4a9" /></mesh>
      {flat.rooms.map((room) => <FloorPolygon key={room.id} polygon={rectanglePolygon(room)} flat={flat} color="#ecf0e8" opacity={0.85} elevation={0.002} />)}
      {wallParts(flat).map((wall) => {
        const [x, , z] = scenePositionCm(wall.position, flat);
        return <mesh key={wall.id} name={wall.id} position={[x, flat.height / 200, z]}><boxGeometry args={[wall.width / 100, flat.height / 100, wall.depth / 100]} /><meshStandardMaterial color={wall.outer ? "#cfd9d2" : "#d8dfd5"} transparent opacity={wall.outer ? 0.22 : 0.38} roughness={1} depthWrite={false} /><Edges color="#a8b6aa" /></mesh>;
      })}
      {flat.windows.map((window) => {
        const wall = flat.walls.find((entry) => entry.id === window.wallId)!;
        const axis = wallAxis(wall);
        const [x, , z] = scenePositionCm(window.position, flat);
        return <mesh key={window.id} name={window.id} position={[x, (window.sillHeight + window.height / 2) / 100, z]}><boxGeometry args={[axis === "x" ? window.width / 100 : 0.025, window.height / 100, axis === "z" ? window.width / 100 : 0.025]} /><meshBasicMaterial color="#70a6b2" transparent opacity={0.55} depthWrite={false} /><Edges color="#568c98" /></mesh>;
      })}
      {flat.doors.map((door) => {
        const geometry = doorGeometry(door, flat);
        const middle = { x: (geometry.hinge.x + geometry.openEnd.x) / 2, z: (geometry.hinge.z + geometry.openEnd.z) / 2 };
        const [x, , z] = scenePositionCm(middle, flat);
        const alongX = geometry.normal.x !== 0;
        return <group key={door.id} name={door.id}><FloorPolygon polygon={rectanglePolygon(geometry.zone)} flat={flat} color={RESERVED_COLOR} opacity={0.2} elevation={0.005} /><mesh position={[x, 1, z]}><boxGeometry args={[alongX ? door.width / 100 : 0.02, 2, alongX ? 0.02 : door.width / 100]} /><meshStandardMaterial color="#b5a273" transparent opacity={0.3} depthWrite={false} /><Edges color="#a39060" /></mesh></group>;
      })}
    </group>
  );
}

function FurnitureModel({ item, flat, selected, colliding, onSelect }: { item: FlatFurniture; flat: Flat; selected: boolean; colliding: boolean; onSelect: (id: string) => void }) {
  const color = colliding ? "#ba4c43" : FURNITURE_COLORS[item.kind];
  return (
    <group name={item.id} position={scenePositionCm(item.position, flat)} rotation={[0, threeRotation(item.orientation), 0]} onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
      {item.kind === "sofa" ? <SofaModel {...item} color={color} selected={selected} opacity={colliding ? 0.55 : 1} /> : (
        <mesh position={[0, item.height * METRES_PER_CM / 2, 0]}>
          <boxGeometry args={[item.width * METRES_PER_CM, item.height * METRES_PER_CM, item.depth * METRES_PER_CM]} />
          <meshStandardMaterial color={color} roughness={0.75} transparent={colliding} opacity={colliding ? 0.55 : 1} depthWrite={!colliding} />
          <Edges color={selected ? "#174c3d" : "#59635a"} linewidth={selected ? 2 : 1} />
        </mesh>
      )}
    </group>
  );
}

export default function RoomScene({ flat, furniture, baseline, issues, selectedId, focusedIds, language, cameraCommand, onSelect }: RoomSceneProps) {
  const colliding = new Set(issues.flatMap(issueItemIds));
  const highlights = issuePolygons(issues);
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: INITIAL_CAMERA_POSITION, fov: 40, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-3, 9, -5]} intensity={2} />
      <RoomShell flat={flat} />
      {baseline.map((item) => {
        const [x, , z] = scenePositionCm(item.position, flat);
        return <mesh key={`baseline-${item.id}`} name={`baseline-${item.id}`} position={[x, 0.01, z]} rotation={[0, threeRotation(item.orientation), 0]}><boxGeometry args={[item.width / 100, 0.004, item.depth / 100]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color="#53675b" transparent opacity={0.28} /></mesh>;
      })}
      {furniture.map((item) => <FurnitureModel key={item.id} item={item} flat={flat} selected={selectedId === item.id || focusedIds.includes(item.id)} colliding={colliding.has(item.id)} onSelect={onSelect} />)}
      {highlights.map((highlight, index) => {
        const centre = polygonCentre(highlight.polygon);
        const [x, , z] = scenePositionCm(centre, flat);
        const nearCount = highlights.slice(0, index).filter((other) => Math.hypot(polygonCentre(other.polygon).x - centre.x, polygonCentre(other.polygon).z - centre.z) < 45).length;
        return <group key={highlight.id}><FloorPolygon polygon={highlight.polygon} flat={flat} color="#e33e35" opacity={0.65} elevation={0.012 + index * 0.00005} /><Html position={[x, 0.05 + nearCount * 0.18, z]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><span className="scene-issue-label">{formatCm(highlight.value, language)} {editorText(language, "editor.unit")}</span></Html></group>;
      })}
      {issues.filter((issue) => issue.code === "height").map((issue) => {
        const item = furniture.find((entry) => entry.id === issue.itemId);
        if (!item) return null;
        const [x, , z] = scenePositionCm(item.position, flat);
        return <Html key={issue.id} position={[x, item.height / 100 + 0.12, z]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><span className="scene-issue-label">+{formatCm(issue.excess, language)} {editorText(language, "editor.unit")}</span></Html>;
      })}
      <CameraControls command={cameraCommand} />
    </Canvas>
  );
}