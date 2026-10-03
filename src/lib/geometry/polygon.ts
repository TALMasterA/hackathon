import * as clippingModule from "polygon-clipping";
import type { Polygon as ClipPolygon, Ring } from "polygon-clipping";
import type { Position2D } from "../../types/domain";
import { pointInPolygon, polygonArea } from "./oriented";

/**
 * Polygon helpers for rooms of any shape: orientation, simplicity, boolean union and intersection.
 * Plan coordinates are x right and z down, so a positive signed area is clockwise on screen.
 */

// polygon-clipping's ES build has only a default export while its types declare named ones.
const clipping = (clippingModule as unknown as { default?: typeof clippingModule }).default ?? clippingModule;

/** Coordinates closer than this are the same point; also the rounding grid of generated outlines. */
export const POINT_EPSILON_CM = 0.01;

const ring = (polygon: readonly Position2D[]): Ring => polygon.map((point) => [point.x, point.z]);
const clip = (polygon: readonly Position2D[]): ClipPolygon => [ring(polygon)];
const points = (pairs: Ring): Position2D[] => {
  const open = pairs.length > 1 && pairs[0][0] === pairs.at(-1)![0] && pairs[0][1] === pairs.at(-1)![1] ? pairs.slice(0, -1) : pairs;
  return open.map(([x, z]) => ({ x, z }));
};

export function signedArea(polygon: readonly Position2D[]): number {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.z - point.z * next.x;
  }, 0) / 2;
}

/** The same polygon, wound clockwise on screen, so each edge's inward normal is (-d.z, d.x). */
export function clockwise(polygon: readonly Position2D[]): Position2D[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
}

const cross = (origin: Position2D, first: Position2D, second: Position2D) => (first.x - origin.x) * (second.z - origin.z) - (first.z - origin.z) * (second.x - origin.x);
const samePoint = (first: Position2D, second: Position2D) => Math.hypot(first.x - second.x, first.z - second.z) <= POINT_EPSILON_CM;

/** Drops repeated corners and corners on a straight line between their neighbours. */
export function simplifyPolygon(polygon: readonly Position2D[]): Position2D[] {
  let result = polygon.filter((point, index) => !samePoint(point, polygon[(index + 1) % polygon.length]));
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index++) {
      const previous = result[(index + result.length - 1) % result.length];
      const next = result[(index + 1) % result.length];
      const length = Math.hypot(next.x - previous.x, next.z - previous.z);
      if (length > 0 && Math.abs(cross(previous, result[index], next)) / length <= POINT_EPSILON_CM) {
        result = result.filter((_, other) => other !== index);
        changed = true;
        break;
      }
    }
  }
  return result;
}

function segmentsTouch(a: Position2D, b: Position2D, c: Position2D, d: Position2D): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSegment = (p: Position2D, q: Position2D, r: Position2D) => Math.abs(cross(p, q, r)) <= 1e-9 && r.x >= Math.min(p.x, q.x) - 1e-9 && r.x <= Math.max(p.x, q.x) + 1e-9 && r.z >= Math.min(p.z, q.z) - 1e-9 && r.z <= Math.max(p.z, q.z) + 1e-9;
  return onSegment(c, d, a) || onSegment(c, d, b) || onSegment(a, b, c) || onSegment(a, b, d);
}

/** At least three corners, no zero-length edge, no area-less shape and no edge crossing or touching another. */
export function isSimplePolygon(polygon: readonly Position2D[]): boolean {
  const count = polygon.length;
  if (count < 3 || polygonArea(polygon) <= POINT_EPSILON_CM) return false;
  for (let first = 0; first < count; first++) {
    const [a, b] = [polygon[first], polygon[(first + 1) % count]];
    if (samePoint(a, b)) return false;
    for (let second = first + 1; second < count; second++) {
      // Neighbouring edges share a corner by design.
      if (second === first + 1 || (first === 0 && second === count - 1)) continue;
      if (segmentsTouch(a, b, polygon[second], polygon[(second + 1) % count])) return false;
    }
  }
  return true;
}

/**
 * Floor shared by two simple polygons, convex or not: its area and its longest extent, so that
 * area / length is the overlap's mean thickness (a thin sliver along a shared edge has a tiny one).
 */
export function overlapOf(first: readonly Position2D[], second: readonly Position2D[]): { area: number; length: number } {
  const pieces = clipping.intersection(clip(first), clip(second));
  const area = pieces.reduce((sum, polygon) => sum + polygonArea(points(polygon[0])) - polygon.slice(1).reduce((holes, hole) => holes + polygonArea(points(hole)), 0), 0);
  const corners = pieces.flatMap((polygon) => points(polygon[0]));
  if (corners.length === 0) return { area: 0, length: 0 };
  const xs = corners.map((point) => point.x);
  const zs = corners.map((point) => point.z);
  return { area, length: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) };
}

export function intersectionArea(first: readonly Position2D[], second: readonly Position2D[]): number {
  return overlapOf(first, second).area;
}

const round = (value: number) => Math.round(value / POINT_EPSILON_CM) * POINT_EPSILON_CM;

/**
 * The outer boundary of the union of the polygons: the largest piece's outer ring, clockwise, on the
 * 0.01 cm grid. Holes and separate smaller pieces are left out; null when there is nothing.
 */
export function unionOuterRing(polygons: readonly (readonly Position2D[])[]): Position2D[] | null {
  const usable = polygons.filter((polygon) => polygon.length >= 3 && polygonArea(polygon) > POINT_EPSILON_CM);
  if (usable.length === 0) return null;
  const [first, ...rest] = usable.map(clip);
  const pieces = clipping.union(first, ...rest).map((polygon) => points(polygon[0]));
  const largest = pieces.sort((a, b) => polygonArea(b) - polygonArea(a))[0];
  return largest ? clockwise(simplifyPolygon(largest.map((point) => ({ x: round(point.x), z: round(point.z) })))) : null;
}

/** Where two lines (a point and a direction each) cross; null when they are parallel. */
export function lineIntersection(firstPoint: Position2D, firstDirection: Position2D, secondPoint: Position2D, secondDirection: Position2D): Position2D | null {
  const denominator = firstDirection.x * secondDirection.z - firstDirection.z * secondDirection.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((secondPoint.x - firstPoint.x) * secondDirection.z - (secondPoint.z - firstPoint.z) * secondDirection.x) / denominator;
  return { x: firstPoint.x + firstDirection.x * t, z: firstPoint.z + firstDirection.z * t };
}

/** A point well inside the polygon, for a label: the centroid when it is inside, else the middle of the widest span. */
export function interiorPoint(polygon: readonly Position2D[]): Position2D {
  const area = signedArea(polygon);
  if (Math.abs(area) > POINT_EPSILON_CM) {
    let cx = 0;
    let cz = 0;
    polygon.forEach((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const factor = point.x * next.z - next.x * point.z;
      cx += (point.x + next.x) * factor;
      cz += (point.z + next.z) * factor;
    });
    const centroid = { x: cx / (6 * area), z: cz / (6 * area) };
    if (pointInPolygon(centroid, polygon)) return centroid;
  }
  const minZ = Math.min(...polygon.map((point) => point.z));
  const maxZ = Math.max(...polygon.map((point) => point.z));
  let best: { point: Position2D; width: number } | null = null;
  for (const share of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const z = minZ + (maxZ - minZ) * share;
    const crossings = polygon.flatMap((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      if ((point.z > z) === (next.z > z)) return [];
      return [point.x + (z - point.z) * (next.x - point.x) / (next.z - point.z)];
    }).sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const width = crossings[index + 1] - crossings[index];
      if (!best || width > best.width) best = { point: { x: (crossings[index] + crossings[index + 1]) / 2, z }, width };
    }
  }
  return best?.point ?? polygon[0];
}

/**
 * The frame of a straight edge's direction family: its angle in [0°, 180°), the unit vector along it
 * (u) and the one across it (m). 0° has u = +x and m = +z; 90° has u = +z and m = +x, so horizontal
 * and vertical edges measure along and across exactly as the axis-aligned code did.
 */
export interface EdgeFrame {
  angle: number;
  u: Position2D;
  m: Position2D;
}

export function frameForAngle(angle: number): EdgeFrame {
  if (angle === 0) return { angle, u: { x: 1, z: 0 }, m: { x: 0, z: 1 } };
  if (angle === 90) return { angle, u: { x: 0, z: 1 }, m: { x: 1, z: 0 } };
  const radians = angle * Math.PI / 180;
  const u = { x: Math.cos(radians), z: Math.sin(radians) };
  return { angle, u, m: angle < 90 ? { x: -u.z, z: u.x } : { x: u.z, z: -u.x } };
}

/** An edge's direction as an angle in [0°, 180°): 0 for horizontal edges, 90 for vertical ones. */
export function edgeAngle(start: Position2D, end: Position2D): number {
  if (start.z === end.z) return 0;
  if (start.x === end.x) return 90;
  const angle = Math.atan2(end.z - start.z, end.x - start.x) * 180 / Math.PI;
  return ((angle % 180) + 180) % 180;
}

export const dot = (first: Position2D, second: Position2D) => first.x * second.x + first.z * second.z;
