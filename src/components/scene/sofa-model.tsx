import { Edges } from "@react-three/drei";
import type { Dimensions } from "@/types/domain";
import { METRES_PER_CM } from "./palette";

type VectorTuple = [number, number, number];

function SofaBox({ size, position, color, outline = false }: { size: VectorTuple; position: VectorTuple; color: string; outline?: boolean }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
      {outline && <Edges color="#245f50" />}
    </mesh>
  );
}

export function SofaModel({ width, depth, height, color, selected = false }: Dimensions & { color: string; selected?: boolean }) {
  const widthM = width * METRES_PER_CM;
  const depthM = depth * METRES_PER_CM;
  const heightM = height * METRES_PER_CM;
  const baseHeight = heightM * 0.3;
  const armWidth = widthM * 0.075;
  const armHeight = heightM * 0.7;
  const backDepth = depthM * 0.18;
  const backHeight = heightM - baseHeight;
  const seatHeight = heightM * 0.17;
  const seatWidth = widthM - 2 * armWidth;
  const cushionGap = seatWidth * 0.015;
  const cushionWidth = (seatWidth - cushionGap) / 2;

  return (
    <group>
      <SofaBox size={[widthM, baseHeight, depthM]} position={[0, baseHeight / 2, 0]} color={color} outline={selected} />
      <SofaBox size={[widthM, backHeight, backDepth]} position={[0, baseHeight + backHeight / 2, depthM / 2 - backDepth / 2]} color={color} />
      <SofaBox size={[armWidth, armHeight, depthM]} position={[-widthM / 2 + armWidth / 2, armHeight / 2, 0]} color={color} />
      <SofaBox size={[armWidth, armHeight, depthM]} position={[widthM / 2 - armWidth / 2, armHeight / 2, 0]} color={color} />
      {([-1, 1] as const).map((side) => (
        <SofaBox key={side} size={[cushionWidth, seatHeight, depthM - backDepth]} position={[side * (cushionWidth + cushionGap) / 2, baseHeight + seatHeight / 2, -backDepth / 2]} color={color} />
      ))}
    </group>
  );
}