import { ShapeUtils, Vector2 } from "three";
import type { OrientedRectangle, PolygonOverlap, Position2D } from "../../types/domain";
import { GEOMETRY_EPSILON_CM } from "./footprint";

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new Error("Orientation must be finite");
  return ((angle % 360) + 360) % 360;
}

export function threeRotation(angle: number): number {
  return -normalizeAngle(angle) * Math.PI / 180;
}

export function rectanglePolygon(rectangle: OrientedRectangle): Position2D[] {
  const radians = normalizeAngle(rectangle.orientation) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    [-rectangle.width / 2, -rectangle.depth / 2],
    [rectangle.width / 2, -rectangle.depth / 2],
    [rectangle.width / 2, rectangle.depth / 2],
    [-rectangle.width / 2, rectangle.depth / 2],
  ].map(([x, z]) => ({ x: rectangle.position.x + x * cosine - z * sine, z: rectangle.position.z + x * sine + z * cosine }));
}

export function polygonBounds(polygon: readonly Position2D[]) {
  return {
    minX: Math.min(...polygon.map((point) => point.x)),
    maxX: Math.max(...polygon.map((point) => point.x)),
    minZ: Math.min(...polygon.map((point) => point.z)),
    maxZ: Math.max(...polygon.map((point) => point.z)),
  };
}

export function polygonArea(polygon: readonly Position2D[]): number {
  return Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.z - point.z * next.x;
  }, 0)) / 2;
}

function sideOfLine(point: Position2D, start: Position2D, end: Position2D): number {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  return ((end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x)) / length;
}

export function clipPolygon(subject: readonly Position2D[], clip: readonly Position2D[]): Position2D[] {
  let output = [...subject];
  for (let edge = 0; edge < clip.length && output.length > 0; edge++) {
    const start = clip[edge];
    const end = clip[(edge + 1) % clip.length];
    const input = output;
    output = [];
    let previous = input[input.length - 1];
    let previousSide = sideOfLine(previous, start, end);
    for (const point of input) {
      const side = sideOfLine(point, start, end);
      const inside = side >= -GEOMETRY_EPSILON_CM;
      const previousInside = previousSide >= -GEOMETRY_EPSILON_CM;
      if (inside !== previousInside) {
        const ratio = previousSide / (previousSide - side);
        output.push({ x: previous.x + ratio * (point.x - previous.x), z: previous.z + ratio * (point.z - previous.z) });
      }
      if (inside) output.push({ ...point });
      previous = point;
      previousSide = side;
    }
  }
  return output.filter((point, index, points) => {
    const previous = points[(index + points.length - 1) % points.length];
    return Math.hypot(point.x - previous.x, point.z - previous.z) > GEOMETRY_EPSILON_CM;
  });
}

function projections(polygon: readonly Position2D[], axis: Position2D): [number, number] {
  const values = polygon.map((point) => point.x * axis.x + point.z * axis.z);
  return [Math.min(...values), Math.max(...values)];
}

export function polygonOverlap(first: readonly Position2D[], second: readonly Position2D[]): PolygonOverlap | null {
  let penetration = Infinity;
  let translation: Position2D = { x: 0, z: 0 };
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length <= GEOMETRY_EPSILON_CM) continue;
      const axis = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length };
      const [firstMin, firstMax] = projections(first, axis);
      const [secondMin, secondMax] = projections(second, axis);
      if (Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) <= GEOMETRY_EPSILON_CM) return null;
      const negative = firstMax - secondMin;
      const positive = secondMax - firstMin;
      const depth = Math.min(negative, positive);
      if (depth < penetration) {
        penetration = depth;
        const signed = negative <= positive ? -negative : positive;
        translation = { x: axis.x * signed, z: axis.z * signed };
      }
    }
  }
  const polygon = clipPolygon(first, second);
  const bounds = polygonBounds(polygon);
  return { penetration, translation, polygon, area: polygonArea(polygon), overlapX: bounds.maxX - bounds.minX, overlapZ: bounds.maxZ - bounds.minZ };
}

function pointInside(point: Position2D, polygon: readonly Position2D[]): boolean {
  return polygon.every((start, index) => sideOfLine(point, start, polygon[(index + 1) % polygon.length]) >= -GEOMETRY_EPSILON_CM);
}

function pointSegmentDistance(point: Position2D, start: Position2D, end: Position2D): number {
  const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.z - start.z);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.z - start.z) * (end.z - start.z)) / lengthSquared));
  return Math.hypot(point.x - start.x - ratio * (end.x - start.x), point.z - start.z - ratio * (end.z - start.z));
}

export function pointPolygonDistance(point: Position2D, polygon: readonly Position2D[]): number {
  if (pointInside(point, polygon)) return 0;
  return Math.min(...polygon.map((start, index) => pointSegmentDistance(point, start, polygon[(index + 1) % polygon.length])));
}

export function rotationFromPoint(point: Position2D, centre: Position2D): number {
  return normalizeAngle(Math.atan2(point.z - centre.z, point.x - centre.x) * 180 / Math.PI);
}

export function polygonDistance(first: readonly Position2D[], second: readonly Position2D[]): number {
  if (polygonOverlap(first, second) || first.some((point) => pointInside(point, second)) || second.some((point) => pointInside(point, first))) return 0;
  let distance = Infinity;
  for (const [vertices, edges] of [[first, second], [second, first]]) {
    for (const point of vertices) {
      for (let index = 0; index < edges.length; index++) {
        distance = Math.min(distance, pointSegmentDistance(point, edges[index], edges[(index + 1) % edges.length]));
      }
    }
  }
  return distance <= GEOMETRY_EPSILON_CM ? 0 : distance;
}

export function scenePositionCm(position: Position2D, envelope: { width: number; depth: number }): [number, number, number] {
  return [(position.x - envelope.width / 2) / 100, 0, (position.z - envelope.depth / 2) / 100];
}

export function polygonCentre(polygon: readonly Position2D[]): Position2D {
  return { x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length, z: polygon.reduce((sum, point) => sum + point.z, 0) / polygon.length };
}

export function polygonTriangles(polygon: readonly Position2D[]): Position2D[][] {
  return ShapeUtils.triangulateShape(polygon.map((point) => new Vector2(point.x, point.z)), []).map((indices) => {
    const triangle = indices.map((index) => polygon[index]);
    const [first, second, third] = triangle;
    return (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x) < 0 ? triangle.reverse() : triangle;
  });
}

export function polygonOutsideArea(footprint: readonly Position2D[], outline: readonly Position2D[]): number {
  const inside = polygonTriangles(outline).reduce((area, triangle) => area + polygonArea(clipPolygon(footprint, triangle)), 0);
  return Math.max(0, polygonArea(footprint) - inside);
}

export function pointInPolygon(point: Position2D, polygon: readonly Position2D[]): boolean {
  if (polygon.some((start, index) => pointSegmentDistance(point, start, polygon[(index + 1) % polygon.length]) <= GEOMETRY_EPSILON_CM)) return true;
  let inside = false;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if ((start.z > point.z) !== (end.z > point.z) && point.x < (end.x - start.x) * (point.z - start.z) / (end.z - start.z) + start.x) inside = !inside;
  }
  return inside;
}

export function floorTrianglePositions(polygon: readonly Position2D[], envelope: { width: number; depth: number }, elevation = 0.012): Float32Array {
  const positions: number[] = [];
  for (const triangle of polygonTriangles(polygon)) {
    for (const point of [...triangle].reverse()) {
      const [x, , z] = scenePositionCm(point, envelope);
      positions.push(x, elevation, z);
    }
  }
  return new Float32Array(positions);
}