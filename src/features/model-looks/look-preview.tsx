"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { FittedObject } from "@/components/scene/furniture-mesh";
import { METRES_PER_CM, SCENE_BACKGROUND } from "@/components/scene/palette";
import type { FlatFurniture } from "@/types/domain";
import { lookRotationDeg, type Look } from "./looks";

const FOV = 35;
const DIRECTION = [0.5, 0.45, -0.74];

/** Small preview of a look inside the item's exact W x D x H outline, seen from the item's front. */
export default function LookPreview({ look, item }: { look: Look; item: FlatFurniture }) {
  const height = item.height * METRES_PER_CM;
  const radius = Math.hypot(item.width, item.height, item.depth) * METRES_PER_CM / 2;
  const distance = radius / Math.sin(FOV / 2 * Math.PI / 180) * 1.05;
  const length = Math.hypot(DIRECTION[0], DIRECTION[1], DIRECTION[2]);
  const target: [number, number, number] = [0, height / 2, 0];
  const position: [number, number, number] = [DIRECTION[0] / length * distance, height / 2 + DIRECTION[1] / length * distance, DIRECTION[2] / length * distance];
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position, fov: FOV, near: 0.01, far: 100 }} gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-3, 9, -5]} intensity={2} />
      <FittedObject source={look.object} item={item} selected colliding={false} lit={false} rotationDeg={lookRotationDeg(look)} />
      <OrbitControls target={target} enablePan={false} enableZoom={false} />
    </Canvas>
  );
}
