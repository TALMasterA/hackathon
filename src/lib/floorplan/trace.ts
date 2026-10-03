import type { Box } from "../geometry/architecture";
import { signedArea, simplifyPolygon } from "../geometry/polygon";
import type { Position2D, RoomKind } from "../../types/domain";

/**
 * The editable trace of one flat, in centimetres in the trace frame (the cropped plan's own axes).
 * Rooms are clear floor areas between the inner faces of the drawn walls; walls are generated from them.
 */

export type EdgeSide = "top" | "bottom" | "left" | "right";
export const EDGE_SIDES: readonly EdgeSide[] = ["top", "bottom", "left", "right"];

/**
 * verified: matched to a drawn wall line; unverified: no convincing line, so the AI or a guess placed it;
 * manual: placed or moved by the user; open: no wall on purpose (open-plan join).
 */
export type EdgeStatus = "verified" | "unverified" | "manual" | "open";

export interface TraceEdge {
  status: EdgeStatus;
  /** Wall thickness measured from the drawn line pair, when the snap found one. */
  thickness?: number;
  /** Where along the edge (centimetres, from–to along the plan axis) the drawing shows a window wall. */
  window?: readonly [number, number];
}

/**
 * A room of any shape: its corners clockwise on screen (x right, z down), and one record per edge,
 * edges[i] running from points[i] to points[i + 1]. A box is four corners from the top-left.
 */
export interface TraceRoom {
  id: string;
  kind: RoomKind;
  points: Position2D[];
  edges: TraceEdge[];
}

export interface TraceDoor {
  id: string;
  /** Opening centre; it is attached to the nearest generated wall. */
  at: Position2D;
  width: number;
  /** Trace room ID the leaf swings into ("outside" for an entrance opening outward), when known. */
  swingInto?: string;
  /** Which end the hinge is at, along the wall's own direction (left or top end is "low"). Default low. */
  hinge?: "low" | "high";
  /** Width not measured from a gap in the drawn wall, so it needs checking. */
  flagged?: boolean;
}

export interface TraceWindow {
  id: string;
  at: Position2D;
  width: number;
  roomId: string;
}

export interface TracePlan {
  rooms: TraceRoom[];
  /** Pairs of rooms joined without a wall between them (open plan, or an L-shaped room as two parts). */
  openPairs: (readonly [string, string])[];
  doors: TraceDoor[];
  windows: TraceWindow[];
}

/** Housing Authority flat-type labels; the number is the expected count of bedrooms. */
export const FLAT_TYPES = ["1P", "1B", "2B", "3B"] as const;
export type FlatType = (typeof FLAT_TYPES)[number];
export const EXPECTED_BEDROOMS: Record<FlatType, number> = { "1P": 0, "1B": 1, "2B": 2, "3B": 3 };

export function isFlatType(value: unknown): value is FlatType {
  return typeof value === "string" && (FLAT_TYPES as readonly string[]).includes(value);
}

export function edges(status: EdgeStatus = "manual", thickness?: number): Record<EdgeSide, TraceEdge> {
  const edge = (): TraceEdge => thickness === undefined ? { status } : { status, thickness };
  return { top: edge(), bottom: edge(), left: edge(), right: edge() };
}

/** Faces are kept on a 0.5 cm grid, so every derived wall centre is an exact multiple of 0.25 cm. */
export function roundFace(value: number): number {
  return Math.round(value * 2) / 2;
}

export function roundedBox(box: Box): Box {
  return { minX: roundFace(box.minX), maxX: roundFace(box.maxX), minZ: roundFace(box.minZ), maxZ: roundFace(box.maxZ) };
}

/** The sides of a box room in edge order: edges[0] is the top, then right, bottom and left. */
export const BOX_EDGE_SIDES: readonly EdgeSide[] = ["top", "right", "bottom", "left"];

export function boxPoints(box: Box): Position2D[] {
  return [{ x: box.minX, z: box.minZ }, { x: box.maxX, z: box.minZ }, { x: box.maxX, z: box.maxZ }, { x: box.minX, z: box.maxZ }];
}

/** A box-shaped room, its edges given per side (missing sides are "manual"). */
export function boxRoom(id: string, kind: RoomKind, box: Box, sides: Partial<Record<EdgeSide, TraceEdge>> = {}): TraceRoom {
  return { id, kind, points: boxPoints(box), edges: BOX_EDGE_SIDES.map((side) => sides[side] ?? { status: "manual" }) };
}

export function roomBounds(room: { readonly points: readonly Position2D[] }): Box {
  const xs = room.points.map((point) => point.x);
  const zs = room.points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export interface RoomEdge {
  index: number;
  start: Position2D;
  end: Position2D;
  length: number;
  /** Unit vector from start to end. */
  direction: Position2D;
  /** Unit vector into the room. */
  inward: Position2D;
  /** "x" for a horizontal edge, "z" for a vertical one, null when it runs at an angle. */
  axis: "x" | "z" | null;
  /** The side of the room a horizontal or vertical edge bounds; null for an angled edge. */
  side: EdgeSide | null;
}

export function roomEdge(room: { readonly points: readonly Position2D[] }, index: number): RoomEdge {
  const start = room.points[index];
  const end = room.points[(index + 1) % room.points.length];
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const direction = length > 0 ? { x: (end.x - start.x) / length, z: (end.z - start.z) / length } : { x: 1, z: 0 };
  const inward = { x: -direction.z, z: direction.x };
  const axis = start.z === end.z ? "x" : start.x === end.x ? "z" : null;
  const side: EdgeSide | null = axis === "x" ? (inward.z > 0 ? "top" : "bottom") : axis === "z" ? (inward.x > 0 ? "left" : "right") : null;
  return { index, start, end, length, direction, inward, axis, side };
}

export function roomEdges(room: { readonly points: readonly Position2D[] }): RoomEdge[] {
  return room.points.map((_, index) => roomEdge(room, index));
}

/** Four corners with horizontal and vertical edges only. */
export function isBoxRoom(room: { readonly points: readonly Position2D[] }): boolean {
  return room.points.length === 4 && roomEdges(room).every((edge) => edge.axis !== null);
}

/**
 * A room's corners cleaned up: wound clockwise, repeated and straight-through corners dropped, with
 * each remaining edge keeping the record of the edge it came from.
 */
export function normaliseRoom(room: TraceRoom): TraceRoom {
  const reversed = signedArea(room.points) < 0;
  const ordered = reversed ? [...room.points].reverse() : room.points;
  // Reversing turns edge i (points i → i+1) into the edge from point n-1-i to n-2-i.
  const edgesInOrder = reversed ? ordered.map((_, index) => room.edges[(2 * room.points.length - 2 - index) % room.points.length]) : room.edges;
  const kept = simplifyPolygon(ordered);
  const keptEdges = kept.map((point) => {
    const at = ordered.findIndex((entry) => entry.x === point.x && entry.z === point.z);
    return edgesInOrder[at] ?? { status: "manual" as const };
  });
  return { ...room, points: kept, edges: keptEdges };
}
