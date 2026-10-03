import type { Dimensions } from "../../types/domain";
import { METRES_PER_CM } from "./palette";

export type Vector3Tuple = [number, number, number];

export interface ObjectBounds {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface BoxFit {
  position: Vector3Tuple;
  rotationY: number;
  scale: Vector3Tuple;
}

/**
 * glTF models face +Z, while FitIn items face local -Z (`SofaModel` puts its backrest at +Z),
 * so every model is turned half a turn before it is fitted to its item box.
 */
export const MODEL_FACING_DEGREES = 180;

export function quarterTurnsOf(rotationDeg: number): 0 | 1 | 2 | 3 {
  const turns = Math.round(rotationDeg / 90) % 4;
  return ((turns + 4) % 4) as 0 | 1 | 2 | 3;
}

/**
 * Transform (Three.js position, Y rotation, then scale order) that turns an object by a multiple of
 * 90 degrees about Y and stretches it non-uniformly so its bounding box is exactly width x height x
 * depth (cm in, metres out), centred on X/Z = 0 with its base on Y = 0 in the item's local frame.
 */
export function fitObjectToBox(bounds: ObjectBounds, dimensions: Dimensions, rotationDeg: number): BoxFit {
  const turns = quarterTurnsOf(rotationDeg);
  const sideways = turns % 2 === 1;
  const size = [0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis]);
  const ratio = (extent: number, target: number) => extent > 1e-9 ? target * METRES_PER_CM / extent : 1;
  const scale: Vector3Tuple = [ratio(size[0], sideways ? dimensions.depth : dimensions.width), ratio(size[1], dimensions.height), ratio(size[2], sideways ? dimensions.width : dimensions.depth)];
  const centreX = (bounds.min[0] + bounds.max[0]) / 2 * scale[0];
  const centreZ = (bounds.min[2] + bounds.max[2]) / 2 * scale[2];
  const cosine = [1, 0, -1, 0][turns];
  const sine = [0, 1, 0, -1][turns];
  return {
    position: [-(centreX * cosine + centreZ * sine), -bounds.min[1] * scale[1], -(-centreX * sine + centreZ * cosine)],
    rotationY: turns * Math.PI / 2,
    scale,
  };
}
