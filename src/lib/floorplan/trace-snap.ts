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

function traceEdge(edge: { status: TraceEdge["status"]; thickness?: number; window?: [number, number] }, cmPerPx: number): TraceEdge {
  return {
    status: edge.status,
    ...(edge.thickness !== undefined ? { thickness: roundFace(edge.thickness) } : {}),
    ...(edge.window ? { window: [roundFace(edge.window[0] * cmPerPx), roundFace(edge.window[1] * cmPerPx)] as const } : {}),
  };
}

/** Snaps rough room boxes (centimetres) onto the drawing; faces land on the 0.5 cm grid. */
export function snapTraceRooms(context: SnapContext, rooms: readonly { id: string; kind: RoomKind; box: Box }[], openPairs: readonly (readonly [string, string])[] = []): TraceRoom[] {
  const pixels = snapRooms(context, rooms.map((room) => ({ id: room.id, box: scaleBox(room.box, 1 / context.cmPerPx) })), openPairs);
  return pixels.map((snapped, index) => ({
    id: rooms[index].id,
    kind: rooms[index].kind,
    box: roundedBox(scaleBox(snapped.box, context.cmPerPx)),
    edges: Object.fromEntries(EDGE_SIDES.map((side) => [side, traceEdge(snapped.edges[side], context.cmPerPx)])) as Record<EdgeSide, TraceEdge>,
  }));
}

/**
 * Re-snaps one edge the user dragged to `position` (centimetres): onto the drawn wall when the
 * drawing clearly shows one there, otherwise exactly where the user left it, as the user's call.
 */
export function snapTraceEdge(context: SnapContext, room: TraceRoom, side: EdgeSide, position: number): { box: Box; edge: TraceEdge } {
  const moved = { ...room.box, [BOX_KEY[side]]: position };
  const snap = snapEdge(context, edgeProbe(scaleBox(moved, 1 / context.cmPerPx), side));
  if (snap.status === "verified") return { box: { ...moved, [BOX_KEY[side]]: roundFace(snap.face * context.cmPerPx) }, edge: traceEdge(snap, context.cmPerPx) };
  return { box: { ...moved, [BOX_KEY[side]]: roundFace(position) }, edge: { status: "manual" } };
}

export interface FaceHit {
  room: TraceRoom;
  side: EdgeSide;
  distance: number;
}

/** The room across a face at a point on it (beyond the wall's measured thickness), if any. */
export function roomAcross(plan: TracePlan, room: TraceRoom, side: EdgeSide, along: number): TraceRoom | undefined {
  const horizontal = side === "top" || side === "bottom";
  const interior = side === "top" || side === "left" ? 1 : -1;
  const across = room.box[BOX_KEY[side]] - interior * ((room.edges[side].thickness ?? 0) + ACROSS_PROBE_CM);
  const probe = horizontal ? { x: along, z: across } : { x: across, z: along };
  return plan.rooms.find((entry) => entry !== room && probe.x >= entry.box.minX && probe.x <= entry.box.maxX && probe.z >= entry.box.minZ && probe.z <= entry.box.maxZ);
}

/** The room face nearest a point, among faces whose span holds the point (and pass `accept`), within reach. */
export function nearestFace(plan: TracePlan, at: Position2D, reach = OPENING_REACH_CM, accept: (hit: FaceHit) => boolean = () => true): FaceHit | null {
  const hits: FaceHit[] = [];
  for (const room of plan.rooms) {
    for (const side of EDGE_SIDES) {
      const horizontal = side === "top" || side === "bottom";
      const along = horizontal ? at.x : at.z;
      const [from, to] = horizontal ? [room.box.minX, room.box.maxX] : [room.box.minZ, room.box.maxZ];
      if (along < from || along > to) continue;
      const distance = Math.abs((horizontal ? at.z : at.x) - room.box[BOX_KEY[side]]);
      if (distance <= reach && accept({ room, side, distance })) hits.push({ room, side, distance });
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
  return hit ? openingOnFace(context, plan, hit.room, hit.side, at) : null;
}

export interface ScannedOpening extends TracedOpening {
  /** True when a door leaf and swing arc are drawn beside the gap. */
  swings: boolean;
  /** The room across the wall, if any; none means the opening leads outside the traced rooms. */
  acrossRoomId?: string;
  /** Ends of the gap closed by a drawn jamb (0–2). */
  jambs: number;
}

/** Faces are sampled this often along their length; each sample finds the opening nearest it. */
const SCAN_STEP_CM = 60;
/** The same opening seen from both sides of a wall, or from two samples. */
const SAME_OPENING_ALONG_CM = 25;
const SAME_OPENING_ACROSS_CM = 40;

/**
 * Every opening drawn along the faces of the traced rooms (faces matched to the drawing or placed by
 * the user): doors, with or without a drawn swing, and glazed windows. An opening seen from both
 * sides of a wall is reported once.
 */
export function scanOpenings(context: SnapContext, plan: TracePlan): ScannedOpening[] {
  const found: ScannedOpening[] = [];
  for (const room of plan.rooms) {
    for (const side of EDGE_SIDES) {
      if (room.edges[side].status !== "verified" && room.edges[side].status !== "manual") continue;
      const horizontal = side === "top" || side === "bottom";
      const [from, to] = horizontal ? [room.box.minX, room.box.maxX] : [room.box.minZ, room.box.maxZ];
      const face = room.box[BOX_KEY[side]];
      for (let along = from + SCAN_STEP_CM / 2; along < to; along += SCAN_STEP_CM) {
        const opening = openingOnFace(context, plan, room, side, horizontal ? { x: along, z: face } : { x: face, z: along });
        // A sample near the end of a face can find an opening further along the same wall line.
        const centre = opening && (horizontal ? opening.at.x : opening.at.z);
        if (!opening || centre! < from || centre! > to) continue;
        const same = found.some((entry) => {
          const [entryAlong, entryAcross, openingAlong, openingAcross] = horizontal ? [entry.at.x, entry.at.z, opening.at.x, opening.at.z] : [entry.at.z, entry.at.x, opening.at.z, opening.at.x];
          return Math.abs(entryAlong - openingAlong) < SAME_OPENING_ALONG_CM && Math.abs(entryAcross - openingAcross) < SAME_OPENING_ACROSS_CM;
        });
        if (!same) found.push(opening);
      }
    }
  }
  return found;
}

function openingOnFace(context: SnapContext, plan: TracePlan, room: TraceRoom, side: EdgeSide, at: Position2D): ScannedOpening | null {
  const horizontal = side === "top" || side === "bottom";
  const interior: 1 | -1 = side === "top" || side === "left" ? 1 : -1;
  const face = room.box[BOX_KEY[side]];
  const thickness = room.edges[side].thickness;
  const px = (cm: number) => cm / context.cmPerPx;
  const finding = measureOpening(context, { orientation: horizontal ? "h" : "v", face: px(face), ...(thickness !== undefined ? { farFace: px(face - interior * thickness) } : {}), interior }, px(horizontal ? at.x : at.z));
  if (!finding) return null;
  // Breaks between glazing strokes inside a window wall are that window, not doors.
  const window = room.edges[side].window;
  const found = finding.centre * context.cmPerPx;
  if (window && found >= window[0] && found <= window[1]) {
    const middle = roundFace((window[0] + window[1]) / 2);
    return { kind: "window", at: horizontal ? { x: middle, z: face } : { x: face, z: middle }, width: roundFace(window[1] - window[0]), roomId: room.id, swings: false, jambs: 0 };
  }
  const centre = roundFace(finding.centre * context.cmPerPx);
  const point = horizontal ? { x: centre, z: face } : { x: face, z: centre };
  const other = roomAcross(plan, room, side, centre);
  const swingInto = finding.swing === 1 ? room.id : finding.swing === -1 ? other?.id : undefined;
  return { kind: finding.kind, at: point, width: roundFace(finding.width * context.cmPerPx), roomId: room.id, ...(swingInto ? { swingInto } : {}), swings: finding.swing !== 0, jambs: finding.jambs, ...(other ? { acrossRoomId: other.id } : {}) };
}

/** Minimum width of a window wall to count as a window. */
const WINDOW_MIN_CM = 30;

/** Windows where the drawing shows window walls along the traced rooms' edges. */
export function windowsFromEdges(plan: TracePlan): { at: Position2D; width: number; roomId: string }[] {
  return plan.rooms.flatMap((room) => EDGE_SIDES.flatMap((side) => {
    const span = room.edges[side].window;
    if (!span) return [];
    const horizontal = side === "top" || side === "bottom";
    const [from, to] = horizontal ? [room.box.minX, room.box.maxX] : [room.box.minZ, room.box.maxZ];
    const [start, end] = [Math.max(from, span[0]), Math.min(to, span[1])];
    if (end - start < WINDOW_MIN_CM) return [];
    const centre = roundFace((start + end) / 2);
    const face = room.box[BOX_KEY[side]];
    return [{ at: horizontal ? { x: centre, z: face } : { x: face, z: centre }, width: roundFace(end - start), roomId: room.id }];
  }));
}

/** The same window found twice (as a window wall and as a glazed gap, or from both sides). */
const SAME_WINDOW_CM = 40;

/** All windows the drawing shows: window walls along the room edges, then glazed gaps not already among them. */
export function drawnWindows(plan: TracePlan, scanned: readonly ScannedOpening[]): { at: Position2D; width: number; roomId: string }[] {
  const windows = windowsFromEdges(plan);
  for (const opening of scanned) {
    if (opening.kind !== "window" || windows.some((window) => Math.hypot(window.at.x - opening.at.x, window.at.z - opening.at.z) < SAME_WINDOW_CM)) continue;
    windows.push({ at: opening.at, width: opening.width, roomId: opening.roomId });
  }
  return windows;
}
