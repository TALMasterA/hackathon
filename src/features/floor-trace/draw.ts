import { polygonArea } from "@/lib/geometry/oriented";
import { dot, edgeAngle, frameForAngle, isSimplePolygon } from "@/lib/geometry/polygon";
import { normaliseRoom, roomBounds, roomEdges, roundFace, type RoomEdge, type TraceRoom } from "@/lib/floorplan/trace";
import { MIN_ROOM_CM } from "@/lib/floorplan/validate";
import type { Position2D } from "@/types/domain";

/**
 * The drawing rules of the review step, kept apart from the UI: snapping corners while a room is drawn,
 * closing the shape, and turning a drag along a wall into an opening.
 */

/** A tap this close to the first corner closes the room. Screen pixels. */
export const CLOSE_SNAP_PX = 12;
/** A corner this close to lining up with another corner of the room is lined up exactly. Screen pixels. */
export const ALIGN_SNAP_PX = 8;
/** A line this close to a 45° step is turned onto it. */
export const ANGLE_SNAP_DEGREES = 7;
/** Narrower drags are slips, not openings. */
export const MIN_OPENING_CM = 30;

export type CornerSnap = "close" | "angle" | "free";

export interface CornerInput {
  point: Position2D;
  /** Centimetres per screen pixel, so the tolerances look the same at any zoom. */
  unit: number;
  /** The corner before this one: the new line turns in 45° steps from it. */
  previous?: Position2D;
  /** The room's first corner; tapping near it closes the room. */
  first?: Position2D;
  /** Other corners to line up with (horizontally or vertically) when a line runs straight. */
  align?: readonly Position2D[];
  /** Alt held: draw at any angle, with no lining up. */
  free?: boolean;
}

const tidy = (value: number) => Math.abs(value) < 1e-9 ? 0 : value;

/**
 * Where a tapped corner goes: onto the first corner when it closes the room; otherwise, from the
 * previous corner, on the nearest 45° step when the line is within 7° of it, with a straight line's end
 * lined up exactly with a nearby corner of the room.
 */
export function snapCorner({ point, unit, previous, first, align = [], free = false }: CornerInput): { point: Position2D; snap: CornerSnap } {
  if (first && previous && Math.hypot(point.x - first.x, point.z - first.z) <= CLOSE_SNAP_PX * unit) return { point: first, snap: "close" };
  if (free || !previous) return { point, snap: "free" };
  const offset = { x: point.x - previous.x, z: point.z - previous.z };
  if (Math.hypot(offset.x, offset.z) === 0) return { point, snap: "free" };
  const angle = Math.atan2(offset.z, offset.x) * 180 / Math.PI;
  const step = Math.round(angle / 45) * 45;
  if (Math.abs(angle - step) > ANGLE_SNAP_DEGREES) return { point, snap: "free" };
  const direction = { x: tidy(Math.cos(step * Math.PI / 180)), z: tidy(Math.sin(step * Math.PI / 180)) };
  const length = dot(offset, direction);
  const snapped = { x: previous.x + direction.x * length, z: previous.z + direction.z * length };
  const lineUp = [...(first ? [first] : []), ...align];
  if (direction.z === 0) {
    const target = lineUp.find((corner) => Math.abs(corner.x - snapped.x) <= ALIGN_SNAP_PX * unit);
    if (target) snapped.x = target.x;
  } else if (direction.x === 0) {
    const target = lineUp.find((corner) => Math.abs(corner.z - snapped.z) <= ALIGN_SNAP_PX * unit);
    if (target) snapped.z = target.z;
  }
  if (direction.z === 0) snapped.z = previous.z;
  if (direction.x === 0) snapped.x = previous.x;
  return { point: snapped, snap: "angle" };
}

export type ShapeProblem = "crossing" | "small";

/** A finished room from its corners: cleaned up and wound clockwise, or why it cannot be a room. */
export function closeShape(corners: readonly Position2D[], kind: TraceRoom["kind"] = "other"): { room: Omit<TraceRoom, "id"> } | { problem: ShapeProblem } {
  const room = normaliseRoom({ id: "", kind, points: [...corners], edges: corners.map(() => ({ status: "manual" as const })) });
  if (room.points.length < 3 || !isSimplePolygon(room.points)) return { problem: "crossing" };
  if (!roomIsBigEnough(room)) return { problem: "small" };
  return { room: { kind: room.kind, points: room.points, edges: room.edges } };
}

/** At least 40 cm across both ways and as much floor as a 40 cm square. */
export function roomIsBigEnough(room: Pick<TraceRoom, "points">): boolean {
  const bounds = roomBounds(room);
  return Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) >= MIN_ROOM_CM && polygonArea(room.points) >= MIN_ROOM_CM * MIN_ROOM_CM;
}

/** How far along an edge (from its start) a point lies, measured on the edge's line. */
export function alongEdge(edge: Pick<RoomEdge, "start" | "direction">, point: Position2D): number {
  return (point.x - edge.start.x) * edge.direction.x + (point.z - edge.start.z) * edge.direction.z;
}

export interface OpeningSpan {
  start: Position2D;
  end: Position2D;
  /** Centre of the opening, on the edge. */
  at: Position2D;
  width: number;
  /** The end the drag began at, as the generated wall will see it ("low" is the left or top end). */
  hinge: "low" | "high";
}

/** An opening dragged along an edge from `from` to `to` (distances along it), kept on the edge. */
export function openingSpan(edge: Pick<RoomEdge, "start" | "end" | "direction" | "length">, from: number, to: number): OpeningSpan {
  const clamp = (value: number) => Math.min(edge.length, Math.max(0, value));
  const [first, second] = [clamp(from), clamp(to)];
  const point = (along: number): Position2D => ({ x: edge.start.x + edge.direction.x * along, z: edge.start.z + edge.direction.z * along });
  const middle = point((first + second) / 2);
  const u = frameForAngle(edgeAngle(edge.start, edge.end)).u;
  const [start, end] = [point(first), point(second)];
  return { start, end, at: { x: roundFace(middle.x), z: roundFace(middle.z) }, width: roundFace(Math.abs(second - first)), hinge: dot(u, start) <= dot(u, end) ? "low" : "high" };
}

/** The edge of one room nearest a point, within reach, with the point moved onto it. */
export function edgeNear(room: Pick<TraceRoom, "points">, point: Position2D, reach: number): { edge: RoomEdge; point: Position2D; distance: number } | null {
  let best: { edge: RoomEdge; point: Position2D; distance: number } | null = null;
  for (const edge of roomEdges(room)) {
    const along = alongEdge(edge, point);
    if (along < 0 || along > edge.length) continue;
    const distance = Math.abs((point.x - edge.start.x) * edge.inward.x + (point.z - edge.start.z) * edge.inward.z);
    if (distance <= reach && (!best || distance < best.distance)) best = { edge, distance, point: { x: edge.start.x + edge.direction.x * along, z: edge.start.z + edge.direction.z * along } };
  }
  return best;
}
