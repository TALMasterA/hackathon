import type { Box } from "../geometry/architecture";
import { pointInPolygon } from "../geometry/oriented";
import { lineIntersection } from "../geometry/polygon";
import type { Position2D, RoomKind } from "../../types/domain";
import { measureOpening } from "./openings";
import { snapEdge, snapRooms, type EdgeProbe, type SnapContext } from "./snap";
import { boxRoom, roomBounds, roomEdge, roomEdges, roundedBox, roundFace, EDGE_SIDES, type EdgeSide, type RoomEdge, type TraceEdge, type TracePlan, type TraceRoom } from "./trace";

/**
 * The bridge between a trace (centimetres) and the analysed raster of the cropped plan (pixels,
 * context.cmPerPx centimetres each): snapping rooms and edges, and measuring openings. The drawing
 * analysis reads horizontal and vertical lines, so only those edges snap; angled edges stay as drawn.
 */

const scaleBox = (box: Box, factor: number): Box => ({ minX: box.minX * factor, maxX: box.maxX * factor, minZ: box.minZ * factor, maxZ: box.maxZ * factor });
/** How far from a room's face a tap may land and still pick that wall. */
const OPENING_REACH_CM = 40;
/** Shorter drawn edges are too short to tell a wall line from fixtures, so they stay as drawn. */
const MIN_SNAP_EDGE_CM = 20;
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
  return pixels.map((snapped, index) => boxRoom(rooms[index].id, rooms[index].kind, roundedBox(scaleBox(snapped.box, context.cmPerPx)), Object.fromEntries(EDGE_SIDES.map((side) => [side, traceEdge(snapped.edges[side], context.cmPerPx)])) as Record<EdgeSide, TraceEdge>));
}

/** Where a horizontal or vertical edge sits across its axis (z for a horizontal edge, x for a vertical one). */
const faceOf = (edge: RoomEdge) => edge.axis === "x" ? edge.start.z : edge.start.x;
/** +1 when the room lies towards larger coordinates across the edge. */
const interiorOf = (edge: RoomEdge): 1 | -1 => (edge.axis === "x" ? edge.inward.z : edge.inward.x) > 0 ? 1 : -1;
const spanOf = (edge: RoomEdge): [number, number] => edge.axis === "x" ? [Math.min(edge.start.x, edge.end.x), Math.max(edge.start.x, edge.end.x)] : [Math.min(edge.start.z, edge.end.z), Math.max(edge.start.z, edge.end.z)];

/**
 * The room's corners with the lines of some edges replaced: each corner becomes the crossing of its
 * two edges' lines, so moving one edge drags its neighbours' ends along their own lines.
 */
export function withEdgeLines(points: readonly Position2D[], lines: ReadonlyMap<number, { point: Position2D; direction: Position2D }>): Position2D[] {
  const count = points.length;
  const line = (index: number) => {
    const replaced = lines.get(index);
    if (replaced) return replaced;
    const start = points[index];
    const end = points[(index + 1) % count];
    return { point: start, direction: { x: end.x - start.x, z: end.z - start.z } };
  };
  return points.map((corner, index) => {
    const previous = (index + count - 1) % count;
    if (!lines.has(previous) && !lines.has(index)) return corner;
    const [first, second] = [line(previous), line(index)];
    const crossing = lineIntersection(first.point, first.direction, second.point, second.direction);
    if (crossing) return crossing;
    // Parallel neighbours: keep the corner, moved onto whichever line was replaced.
    const moved = lines.get(index) ?? lines.get(previous)!;
    const length = Math.hypot(moved.direction.x, moved.direction.z);
    const unit = { x: moved.direction.x / length, z: moved.direction.z / length };
    const along = (corner.x - moved.point.x) * unit.x + (corner.z - moved.point.z) * unit.z;
    return { x: moved.point.x + unit.x * along, z: moved.point.z + unit.z * along };
  });
}

/** The room with edge `index` moved, parallel to itself, to pass through `through`. */
export function moveEdge(room: TraceRoom, index: number, through: Position2D): Position2D[] {
  const edge = roomEdge(room, index);
  return withEdgeLines(room.points, new Map([[index, { point: through, direction: edge.direction }]]));
}

function probeFor(context: SnapContext, room: Pick<TraceRoom, "points">, edge: RoomEdge): EdgeProbe {
  const bounds = roomBounds(room);
  const [from, to] = spanOf(edge);
  const px = (cm: number) => cm / context.cmPerPx;
  return { orientation: edge.axis === "x" ? "h" : "v", position: px(faceOf(edge)), from: px(from), to: px(to), interior: interiorOf(edge), roomSize: px(edge.axis === "x" ? bounds.maxZ - bounds.minZ : bounds.maxX - bounds.minX) };
}

/** The line of a horizontal or vertical edge moved to `face` across its axis. */
const lineAt = (edge: RoomEdge, face: number) => ({ point: edge.axis === "x" ? { x: edge.start.x, z: face } : { x: face, z: edge.start.z }, direction: edge.direction });

/**
 * Re-snaps one edge the user moved: onto the drawn wall when it is horizontal or vertical and the
 * drawing clearly shows one there, otherwise exactly where the user left it, as the user's call.
 */
export function snapTraceEdge(context: SnapContext, room: TraceRoom, index: number, through: Position2D): { points: Position2D[]; edge: TraceEdge } {
  const moved = { ...room, points: moveEdge(room, index, through) };
  const edge = roomEdge(moved, index);
  if (edge.axis === null) return { points: moved.points, edge: { status: "manual" } };
  const snap = snapEdge(context, probeFor(context, moved, edge));
  const face = snap.status === "verified" ? roundFace(snap.face * context.cmPerPx) : roundFace(faceOf(edge));
  return { points: withEdgeLines(moved.points, new Map([[index, lineAt(edge, face)]])), edge: snap.status === "verified" ? traceEdge(snap, context.cmPerPx) : { status: "manual" } };
}

/**
 * Snaps every horizontal and vertical edge of a newly drawn room to the drawn walls at once. Matched
 * edges move onto the wall and are verified; the rest, and every angled edge, stay as drawn.
 */
export function snapDrawnRoom(context: SnapContext, room: TraceRoom): TraceRoom {
  const lines = new Map<number, { point: Position2D; direction: Position2D }>();
  const records = roomEdges(room).map((edge): TraceEdge => {
    if (edge.axis === null || edge.length < MIN_SNAP_EDGE_CM) return { status: "manual" };
    const snap = snapEdge(context, probeFor(context, room, edge));
    if (snap.status !== "verified") return { status: "manual" };
    lines.set(edge.index, lineAt(edge, roundFace(snap.face * context.cmPerPx)));
    return traceEdge(snap, context.cmPerPx);
  });
  return { ...room, points: withEdgeLines(room.points, lines), edges: records };
}

export interface FaceHit {
  room: TraceRoom;
  /** The edge's index in room.points / room.edges. */
  index: number;
  edge: RoomEdge;
  /** The tapped point moved onto the edge. */
  point: Position2D;
  distance: number;
}

/** The room across an edge at a point on it (beyond the wall's measured thickness), if any. */
export function roomAcross(plan: TracePlan, room: TraceRoom, index: number, at: Position2D): TraceRoom | undefined {
  const edge = roomEdge(room, index);
  const reach = (room.edges[index]?.thickness ?? 0) + ACROSS_PROBE_CM;
  const probe = { x: at.x - edge.inward.x * reach, z: at.z - edge.inward.z * reach };
  return plan.rooms.find((entry) => entry !== room && pointInPolygon(probe, entry.points));
}

/** The room edge nearest a point, among edges whose span holds the point (and pass `accept`), within reach. */
export function nearestFace(plan: TracePlan, at: Position2D, reach = OPENING_REACH_CM, accept: (hit: FaceHit) => boolean = () => true): FaceHit | null {
  const hits: FaceHit[] = [];
  for (const room of plan.rooms) {
    for (const edge of roomEdges(room)) {
      const along = (at.x - edge.start.x) * edge.direction.x + (at.z - edge.start.z) * edge.direction.z;
      if (along < 0 || along > edge.length) continue;
      const distance = Math.abs((at.x - edge.start.x) * edge.inward.x + (at.z - edge.start.z) * edge.inward.z);
      const hit: FaceHit = { room, index: edge.index, edge, point: { x: edge.start.x + edge.direction.x * along, z: edge.start.z + edge.direction.z * along }, distance };
      if (distance <= reach && accept(hit)) hits.push(hit);
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
  return hit ? openingOnFace(context, plan, hit.room, hit.index, at) : null;
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
 * Every opening drawn along the horizontal and vertical faces of the traced rooms (faces matched to
 * the drawing or placed by the user): doors, with or without a drawn swing, and glazed windows. An
 * opening seen from both sides of a wall is reported once.
 */
export function scanOpenings(context: SnapContext, plan: TracePlan): ScannedOpening[] {
  const found: ScannedOpening[] = [];
  for (const room of plan.rooms) {
    for (const edge of roomEdges(room)) {
      const status = room.edges[edge.index]?.status;
      if (edge.axis === null || (status !== "verified" && status !== "manual")) continue;
      const horizontal = edge.axis === "x";
      const [from, to] = spanOf(edge);
      const face = faceOf(edge);
      for (let along = from + SCAN_STEP_CM / 2; along < to; along += SCAN_STEP_CM) {
        const opening = openingOnFace(context, plan, room, edge.index, horizontal ? { x: along, z: face } : { x: face, z: along });
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

function openingOnFace(context: SnapContext, plan: TracePlan, room: TraceRoom, index: number, at: Position2D): ScannedOpening | null {
  const edge = roomEdge(room, index);
  if (edge.axis === null) return null;
  const horizontal = edge.axis === "x";
  const interior = interiorOf(edge);
  const face = faceOf(edge);
  const thickness = room.edges[index]?.thickness;
  const px = (cm: number) => cm / context.cmPerPx;
  const finding = measureOpening(context, { orientation: horizontal ? "h" : "v", face: px(face), ...(thickness !== undefined ? { farFace: px(face - interior * thickness) } : {}), interior }, px(horizontal ? at.x : at.z));
  if (!finding) return null;
  // Breaks between glazing strokes inside a window wall are that window, not doors.
  const window = room.edges[index]?.window;
  const found = finding.centre * context.cmPerPx;
  if (window && found >= window[0] && found <= window[1]) {
    const middle = roundFace((window[0] + window[1]) / 2);
    return { kind: "window", at: horizontal ? { x: middle, z: face } : { x: face, z: middle }, width: roundFace(window[1] - window[0]), roomId: room.id, swings: false, jambs: 0 };
  }
  const centre = roundFace(finding.centre * context.cmPerPx);
  const point = horizontal ? { x: centre, z: face } : { x: face, z: centre };
  const other = roomAcross(plan, room, index, point);
  const swingInto = finding.swing === 1 ? room.id : finding.swing === -1 ? other?.id : undefined;
  return { kind: finding.kind, at: point, width: roundFace(finding.width * context.cmPerPx), roomId: room.id, ...(swingInto ? { swingInto } : {}), swings: finding.swing !== 0, jambs: finding.jambs, ...(other ? { acrossRoomId: other.id } : {}) };
}

/** Minimum width of a window wall to count as a window. */
const WINDOW_MIN_CM = 30;

/** Windows where the drawing shows window walls along the traced rooms' edges. */
export function windowsFromEdges(plan: TracePlan): { at: Position2D; width: number; roomId: string }[] {
  return plan.rooms.flatMap((room) => roomEdges(room).flatMap((edge) => {
    const span = room.edges[edge.index]?.window;
    if (!span || edge.axis === null) return [];
    const horizontal = edge.axis === "x";
    const [from, to] = spanOf(edge);
    const [start, end] = [Math.max(from, span[0]), Math.min(to, span[1])];
    if (end - start < WINDOW_MIN_CM) return [];
    const centre = roundFace((start + end) / 2);
    const face = faceOf(edge);
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
