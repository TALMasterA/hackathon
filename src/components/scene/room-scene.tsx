"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import type { SceneView } from "@/features/fit-check/state";
import type { CandidateFurniture, FurnitureItem, Language, Position2D, ReservedZone, Room } from "@/types/domain";
import { CANDIDATE_COLOR, FURNITURE_COLORS, METRES_PER_CM, RESERVED_COLOR, SCENE_BACKGROUND } from "./palette";
import { SofaModel } from "./sofa-model";

const INITIAL_CAMERA_POSITION: [number, number, number] = [2, 6, -6.5];

export interface CameraCommand {
  action: "reset" | "in" | "out";
  sequence: number;
}

export interface RoomSceneProps {
  room: Room;
  furniture: readonly FurnitureItem[];
  zones: readonly ReservedZone[];
  candidate: CandidateFurniture | null;
  view: SceneView;
  selectedId: string;
  language: Language;
  cameraCommand: CameraCommand;
  onSelect: (id: string) => void;
}

function scenePosition(position: Position2D, room: Room): [number, number, number] {
  return [(position.x - room.width / 2) * METRES_PER_CM, 0, (position.z - room.depth / 2) * METRES_PER_CM];
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
      const nextDistance = Math.min(12, Math.max(4.2, offset.length() * (command.action === "in" ? 0.82 : 1.22)));
      camera.position.copy(control.target).add(offset.setLength(nextDistance));
    }
    control.update();
    control.enableDamping = dampingEnabled;
    invalidate();
  }, [command, camera, invalidate]);

  return <OrbitControls ref={controls} makeDefault target={[0, 0.6, 0]} enablePan={false} enableDamping minDistance={4.2} maxDistance={12} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.05} minAzimuthAngle={Math.PI * 0.75} maxAzimuthAngle={Math.PI * 1.25} />;
}

function RoomShell({ room }: { room: Room }) {
  const width = room.width * METRES_PER_CM;
  const depth = room.depth * METRES_PER_CM;
  const height = room.height * METRES_PER_CM;
  const wallThickness = 0.06;
  return (
    <group name="room-shell">
      <mesh position={[0, -0.04, 0]}><boxGeometry args={[width, 0.08, depth]} /><meshStandardMaterial color="#cdd9d0" roughness={1} /><Edges color="#a5b4a9" /></mesh>
      <mesh position={[0, height / 2, depth / 2 + wallThickness / 2]}><boxGeometry args={[width + 2 * wallThickness, height, wallThickness]} /><meshStandardMaterial color="#e7e9e3" roughness={1} /></mesh>
      <mesh position={[-width / 2 - wallThickness / 2, height / 2, 0]}><boxGeometry args={[wallThickness, height, depth]} /><meshStandardMaterial color="#dce3dc" roughness={1} /></mesh>
      <mesh position={[width / 2 + wallThickness / 2, height / 2, 0]}><boxGeometry args={[wallThickness, height, depth]} /><meshStandardMaterial color="#e3e8e0" roughness={1} /></mesh>
    </group>
  );
}

function FurnitureModel({ item, room, selected, onSelect }: { item: FurnitureItem; room: Room; selected: boolean; onSelect: (id: string) => void }) {
  const position = scenePosition(item.position, room);
  return (
    <group name={item.id} position={position} rotation={[0, item.orientation * Math.PI / 180, 0]} onClick={item.replaceable ? (event) => { event.stopPropagation(); onSelect(item.id); } : undefined}>
      {item.kind === "sofa" ? <SofaModel {...item} color={FURNITURE_COLORS[item.kind]} selected={selected} /> : (
        <mesh position={[0, item.height * METRES_PER_CM / 2, 0]}>
          <boxGeometry args={[item.width * METRES_PER_CM, item.height * METRES_PER_CM, item.depth * METRES_PER_CM]} />
          <meshStandardMaterial color={FURNITURE_COLORS[item.kind]} roughness={0.75} />
          <Edges color="#59635a" />
        </mesh>
      )}
    </group>
  );
}

export default function RoomScene({ room, furniture, zones, candidate, view, selectedId, cameraCommand, onSelect }: RoomSceneProps) {
  const after = view === "after" && candidate !== null;
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: INITIAL_CAMERA_POSITION, fov: 42, near: 0.1, far: 60 }} gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-3, 7, -4]} intensity={2} />
      <RoomShell room={room} />
      {zones.map((zone) => {
        const [x, , z] = scenePosition(zone.position, room);
        return (
          <mesh key={zone.id} name={zone.id} position={[x, 0.008, z]}>
            <boxGeometry args={[zone.width * METRES_PER_CM, 0.006, zone.depth * METRES_PER_CM]} />
            <meshBasicMaterial color={RESERVED_COLOR} transparent opacity={0.24} depthWrite={false} />
            <Edges color={RESERVED_COLOR} />
          </mesh>
        );
      })}
      {furniture.filter((item) => !(after && item.id === candidate.replacesId)).map((item) => <FurnitureModel key={item.id} item={item} room={room} selected={item.id === selectedId} onSelect={onSelect} />)}
      {after && <group name="candidate-sofa" position={scenePosition(candidate.position, room)} rotation={[0, candidate.orientation * Math.PI / 180, 0]}><SofaModel {...candidate} color={CANDIDATE_COLOR} /></group>}
      <CameraControls command={cameraCommand} />
    </Canvas>
  );
}