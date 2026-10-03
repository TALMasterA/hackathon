import type { Box } from "../geometry/architecture";
import type { Position2D, RoomKind } from "../../types/domain";
import { measureOpening } from "./openings";
import { edgeProbe, snapEdge, snapRooms, type SnapContext } from "./snap";
import { EDGE_SIDES, roundedBox, roundFace, type EdgeSide, type TraceEdge, type TracePlan, type TraceRoom } from "./trace";

/**
 * The bridge between a trace (centimetres) and the analysed raster of the cropped plan (pixels,
 * context.cmPerPx centimetres each): snapping rooms and edges, and measuring openings.
 */

const scaleBox = (box: Box, factor: number): Box => ({ minX: box.minX * factor, maxX: box.maxX * factor, minZ: box.minZ * factor, maxZ: box.maxZ * factor });
const BOX_KEY: Record<EdgeSide, keyof Box> = { top: "minZ", bottom: "maxZ", left: "minX", right: "maxX" };
/** How far from a room's face a tap may land and still pick that wall. */
const OPENING_REACH_CM = 40;
/** A point this far past a wall's far face is inside the room across it. */
const ACROSS_PROBE_CM = 10;

/** Snaps rough room boxes (centimetres) onto the drawing; faces land on the 0.5 cm grid. */
export function snapTraceRooms(context: SnapContext, rooms: readonly { id: string; kind: RoomKind; box: Box }[], openPairs: readonly (readonly [string, string])[] = []): TraceRoom[] {
  const pixels = snapRooms(context, rooms.map((room) => ({ id: room.id, box: scaleBox(room.box, 1 / context.cmPerPx) })), openPairs);
  return pixels.map((snapped, index) => ({
    id: rooms[index].id,
    kind: rooms[index].kind,
    box: roundedBox(scaleBox(snapped.box, context.cmPerPx)),
    edges: Object.fromEntries(EDGE_SIDES.map((side) => {
      const edge = snapped.edges[side];
      return [side, edge.thickness !== undefined ? { status: edge.status, thickness: roundFace(edge.thickness) } : { status: edge.status }];
    })) as Record<EdgeSide, TraceEdge>,
  }));
}

/**
 * Re-snaps one edge the user dragged to `position` (centimetres): onto the drawn wall when the
 * drawing clearly shows one there, otherwise exactly where the user left it, as the user's call.
 */
export function snapTraceEdge(context: SnapContext, room: TraceRoom, side: EdgeSide, position: number): { box: Box; edge: TraceEdge } {
  const moved = { ...room.box, [BOX_KEY[side]]: position };
  const snap = snapEdge(context, edgeProbe(scaleBox(moved, 1 / context.cmPerPx), side));
  if (snap.status === "verified") {
    return { box: { ...moved, [BOX_KEY[side]]: roundFace(snap.face * context.cmPerPx) }, edge: { status: "verified", ...(snap.thickness !== undefined ? { thickness: roundFace(snap.thickness) } : {}) } };
  }
  return { box: { ...moved, [BOX_KEY[side]]: roundFace(position) }, edge: { status: "manual" } };
}

interface FaceHit {
  room: TraceRoom;
  side: EdgeSide;
  distance: number;
}

/** The room face nearest a point, among faces whose span holds the point, within reach. */
export function nearestFace(plan: TracePlan, at: Position2D, reach = OPENING_REACH_CM): FaceHit | null {
  const hits: FaceHit[] = [];
  for (const room of plan.rooms) {
    for (const side of EDGE_SIDES) {
      const horizontal = side === "top" || side === "bottom";
      const along = horizontal ? at.x : at.z;
      const [from, to] = horizontal ? [room.box.minX, room.box.maxX] : [room.box.minZ, room.box.maxZ];
      if (along < from || along > to) continue;
      const distance = Math.abs((horizontal ? at.z : at.x) - room.box[BOX_KEY[side]]);
      if (distance <= reach) hits.push({ room, side, distance });
    }
  }
  return hits.sort((first, second) => first.distance - second.distance)[0] ?? null;
}

export interface TracedOpening {
  kind: "door" | "window";
  /** On the room's face, at the opening's centre. */
  at: Position2D;
  width: number;
  roomId: string;
  swingInto?: string;
}

/** Finds the drawn opening nearest a tap: its centre, clear width, kind and (for doors) swing side. */
export function traceOpening(context: SnapContext, plan: TracePlan, at: Position2D): TracedOpening | null {
  const hit = nearestFace(plan, at);
  if (!hit) return null;
  const { room, side } = hit;
  const horizontal = side === "top" || side === "bottom";
  const interior: 1 | -1 = side === "top" || side === "left" ? 1 : -1;
  const face = room.box[BOX_KEY[side]];
  const thickness = room.edges[side].thickness;
  const px = (cm: number) => cm / context.cmPerPx;
  const finding = measureOpening(context, { orientation: horizontal ? "h" : "v", face: px(face), ...(thickness !== undefined ? { farFace: px(face - interior * thickness) } : {}), interior }, px(horizontal ? at.x : at.z));
  if (!finding) return null;
  const centre = roundFace(finding.centre * context.cmPerPx);
  const point = horizontal ? { x: centre, z: face } : { x: face, z: centre };
  const across = face - interior * ((thickness ?? 0) + ACROSS_PROBE_CM);
  const probe = horizontal ? { x: centre, z: across } : { x: across, z: centre };
  const other = plan.rooms.find((entry) => entry !== room && probe.x >= entry.box.minX && probe.x <= entry.box.maxX && probe.z >= entry.box.minZ && probe.z <= entry.box.maxZ);
  const swingInto = finding.swing === 1 ? room.id : finding.swing === -1 ? other?.id : undefined;
  return { kind: finding.kind, at: point, width: roundFace(finding.width * context.cmPerPx), roomId: room.id, ...(swingInto ? { swingInto } : {}) };
}
