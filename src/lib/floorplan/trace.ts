import type { Box } from "../geometry/architecture";
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
}

export interface TraceRoom {
  id: string;
  kind: RoomKind;
  box: Box;
  edges: Record<EdgeSide, TraceEdge>;
}

export interface TraceDoor {
  id: string;
  /** Opening centre; it is attached to the nearest generated wall. */
  at: Position2D;
  width: number;
  /** Trace room ID the leaf swings into, when known from the drawing or the user. */
  swingInto?: string;
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
  /** Pairs of rooms joined without a wall between them (open plan, or an L-shaped room). */
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
