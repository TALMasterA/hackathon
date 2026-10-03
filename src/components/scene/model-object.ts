import { Box3, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Color, type Material, type Object3D } from "three";
import type { ObjectBounds } from "./fit";
import { COLLISION_COLOR, COLLISION_OPACITY } from "./palette";

const boundsCache = new WeakMap<Object3D, ObjectBounds>();
const litMaterials = new WeakMap<Material, Material>();

/** Exact bounding box of an object in its own frame, including its root transform. */
export function objectBounds(object: Object3D): ObjectBounds {
  const cached = boundsCache.get(object);
  if (cached) return cached;
  const box = new Box3().setFromObject(object, true);
  if (box.isEmpty()) throw new Error("Model has no geometry");
  const bounds: ObjectBounds = { min: box.min.toArray(), max: box.max.toArray() };
  boundsCache.set(object, bounds);
  return bounds;
}

/** Kenney models are flagged unlit; a shared lit copy lets the scene's existing lights shade them. */
function litMaterial(material: Material): Material {
  if (!(material instanceof MeshBasicMaterial)) return material;
  let lit = litMaterials.get(material);
  if (!lit) {
    lit = new MeshStandardMaterial({ name: material.name, color: material.color, map: material.map, transparent: material.transparent, opacity: material.opacity, side: material.side, roughness: 0.8, metalness: 0 });
    litMaterials.set(material, lit);
  }
  return lit;
}

function tintedMaterial(material: Material): Material {
  const copy = material.clone();
  (copy as Material & { color?: Color }).color?.set(COLLISION_COLOR);
  copy.transparent = true;
  copy.opacity = COLLISION_OPACITY;
  copy.depthWrite = false;
  return copy;
}

/**
 * Clones a cached model (sharing its geometry) and swaps in lit and/or collision-tinted materials.
 * The cached source is never mutated; `owned` lists the per-item materials the caller must dispose.
 */
export function prepareModelObject(source: Object3D, options: { lit: boolean; colliding: boolean }) {
  const object = source.clone(true);
  const owned: Material[] = [];
  const convert = (material: Material) => {
    const base = options.lit ? litMaterial(material) : material;
    if (!options.colliding) return base;
    const tinted = tintedMaterial(base);
    owned.push(tinted);
    return tinted;
  };
  object.traverse((child) => {
    if (child instanceof Mesh) child.material = Array.isArray(child.material) ? child.material.map(convert) : convert(child.material);
  });
  return { object, owned };
}
