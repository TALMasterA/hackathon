import type { Footprint, Orientation, Position2D } from "../../types/domain";

export const GEOMETRY_EPSILON_CM = 0.000001;

interface FootprintSource {
  width: number;
  depth: number;
  position: Position2D;
  orientation?: Orientation;
}

export function getFootprint(item: FootprintSource): Footprint {
  const width = item.orientation === 90 ? item.depth : item.width;
  const depth = item.orientation === 90 ? item.width : item.depth;
  return {
    minX: item.position.x - width / 2,
    maxX: item.position.x + width / 2,
    minZ: item.position.z - depth / 2,
    maxZ: item.position.z + depth / 2,
    width,
    depth,
  };
}

export function getOverlap(first: Footprint, second: Footprint): { overlapX: number; overlapZ: number } | null {
  const overlapX = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
  const overlapZ = Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ);
  return overlapX > GEOMETRY_EPSILON_CM && overlapZ > GEOMETRY_EPSILON_CM
    ? { overlapX, overlapZ }
    : null;
}