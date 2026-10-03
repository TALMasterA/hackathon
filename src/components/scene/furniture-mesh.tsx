"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Edges, useGLTF } from "@react-three/drei";
import type { Object3D } from "three";
import type { FlatFurniture } from "@/types/domain";
import { fitObjectToBox, MODEL_FACING_DEGREES } from "./fit";
import { FURNITURE_MODEL_URLS, furnitureModelUrl, type FurnitureAppearance } from "./furniture-models";
import { objectBounds, prepareModelObject } from "./model-object";
import { COLLISION_COLOR, COLLISION_OPACITY, EDGE_COLOR, FURNITURE_COLORS, METRES_PER_CM, SELECTED_EDGE_COLOR } from "./palette";
import { SceneErrorBoundary } from "./scene-error-boundary";
import { SofaModel } from "./sofa-model";

// Same-origin files only: no Draco/Meshopt decoders are fetched from a CDN.
for (const url of FURNITURE_MODEL_URLS) useGLTF.preload(url, false, false);

function BoxOutline({ item }: { item: FlatFurniture }) {
  return (
    <mesh position={[0, item.height * METRES_PER_CM / 2, 0]} raycast={() => null}>
      <boxGeometry args={[item.width * METRES_PER_CM, item.height * METRES_PER_CM, item.depth * METRES_PER_CM]} />
      <meshBasicMaterial visible={false} />
      <Edges color={SELECTED_EDGE_COLOR} linewidth={2} />
    </mesh>
  );
}

function BoxFurniture({ item, selected, colliding }: { item: FlatFurniture; selected: boolean; colliding: boolean }) {
  const color = colliding ? COLLISION_COLOR : FURNITURE_COLORS[item.kind];
  return item.kind === "sofa" ? <SofaModel {...item} color={color} selected={selected} opacity={colliding ? COLLISION_OPACITY : 1} /> : (
    <mesh position={[0, item.height * METRES_PER_CM / 2, 0]}>
      <boxGeometry args={[item.width * METRES_PER_CM, item.height * METRES_PER_CM, item.depth * METRES_PER_CM]} />
      <meshStandardMaterial color={color} roughness={0.75} transparent={colliding} opacity={colliding ? COLLISION_OPACITY : 1} depthWrite={!colliding} />
      <Edges color={selected ? SELECTED_EDGE_COLOR : EDGE_COLOR} linewidth={selected ? 2 : 1} />
    </mesh>
  );
}

interface FittedObjectProps {
  source: Object3D;
  item: FlatFurniture;
  selected: boolean;
  colliding: boolean;
  lit: boolean;
  rotationDeg: number;
}

/** Any model, stretched to the item's checked box; the box itself stays the geometry for every check. */
export function FittedObject({ source, item, selected, colliding, lit, rotationDeg }: FittedObjectProps) {
  const invalidate = useThree((state) => state.invalidate);
  const bounds = useMemo(() => objectBounds(source), [source]);
  const prepared = useMemo(() => prepareModelObject(source, { lit, colliding }), [source, lit, colliding]);
  useEffect(() => {
    invalidate();
    return () => prepared.owned.forEach((material) => material.dispose());
  }, [prepared, invalidate]);
  const fit = fitObjectToBox(bounds, item, rotationDeg);
  return (
    <>
      <group position={fit.position} rotation={[0, fit.rotationY, 0]} scale={fit.scale}><primitive object={prepared.object} /></group>
      {selected && <BoxOutline item={item} />}
    </>
  );
}

function KindModel({ url, ...props }: Omit<FittedObjectProps, "source" | "lit" | "rotationDeg"> & { url: string }) {
  const { scene } = useGLTF(url, false, false);
  return <FittedObject source={scene} lit rotationDeg={MODEL_FACING_DEGREES} {...props} />;
}

export interface FurnitureMeshProps {
  item: FlatFurniture;
  selected: boolean;
  colliding: boolean;
  appearance: FurnitureAppearance;
}

/** Kind model in Models mode; today's box/sofa in Boxes mode, while loading, on load failure or without a mapping. */
export function FurnitureMesh({ item, selected, colliding, appearance }: FurnitureMeshProps) {
  const box = <BoxFurniture item={item} selected={selected} colliding={colliding} />;
  const url = appearance === "models" ? furnitureModelUrl(item) : null;
  if (!url) return box;
  return (
    <SceneErrorBoundary key={url} fallback={box}>
      <Suspense fallback={box}><KindModel url={url} item={item} selected={selected} colliding={colliding} /></Suspense>
    </SceneErrorBoundary>
  );
}
