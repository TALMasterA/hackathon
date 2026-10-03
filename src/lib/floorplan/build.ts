import { boxRectangle, rectangleBox, wallAxis } from "../geometry/architecture";
import type { Door, Flat, FlatRoom, FlatTrace, FlatWindow, LocalizedName, Position2D, Wall } from "../../types/domain";
import { attachDoors, attachWindows, type OpeningProblem } from "./attach";
import { readFlat } from "./flat-file";
import { ROOM_KINDS, roomIdentities } from "./names";
import type { FlatType, TracePlan } from "./trace";
import { internalAreaM2, traceIssue, validateTrace, type TraceIssue } from "./validate";
import { wallsFromRooms } from "./walls";

/** The ceiling range offered for a traced flat, as for the demo flat. */
export const TRACED_CEILING = { minimum: 220, maximum: 350, initial: 260 };

/** Rooms, walls and openings of a trace in its own frame, before normalising to the flat's origin. */
export interface TraceGeometry {
  /** In plan order: rooms[i] is plan.rooms[i] with its flat ID and name. */
  rooms: FlatRoom[];
  walls: Wall[];
  doors: Door[];
  windows: FlatWindow[];
  problems: OpeningProblem[];
}

export interface BuildMeta {
  id?: string;
  name: LocalizedName;
  ceilingHeight: number;
  trace: Omit<FlatTrace, "uncheckedEdges">;
  flatType?: FlatType | null;
  declaredAreaM2?: number | null;
  defaultOuter?: number;
}

export interface BuildResult {
  /** Present only when no error blocks the flat. */
  flat: Flat | null;
  issues: TraceIssue[];
  geometry: TraceGeometry;
  areaM2: number;
}

/** Living room first, then by kind, then front to back and left to right, for stable numbering. */
function namingOrder(plan: TracePlan) {
  return plan.rooms.map((room, index) => ({ room, index }))
    .sort((first, second) => ROOM_KINDS.indexOf(first.room.kind) - ROOM_KINDS.indexOf(second.room.kind) || first.room.box.minZ - second.room.box.minZ || first.room.box.minX - second.room.box.minX);
}

export function traceGeometry(plan: TracePlan, defaultOuter?: number): TraceGeometry {
  const order = namingOrder(plan);
  const identities = roomIdentities(order.map((entry) => entry.room));
  const identity = new Map(order.map((entry, position) => [entry.room.id, identities[position]]));
  const rooms: FlatRoom[] = plan.rooms.map((room) => ({ ...identity.get(room.id)!, kind: room.kind, ...boxRectangle(room.box) }));
  const flatId = (traceId: string | undefined) => traceId === undefined ? undefined : identity.get(traceId)?.id;
  const walls = wallsFromRooms(plan.rooms, { openPairs: plan.openPairs, defaultOuter });
  const doors = attachDoors(rooms, walls, plan.doors.map((door) => ({ id: door.id, at: door.at, width: door.width, swingInto: flatId(door.swingInto) })));
  const windows = attachWindows(rooms, walls, plan.windows.map((window) => ({ id: window.id, at: window.at, width: window.width, roomId: flatId(window.roomId) ?? window.roomId })));
  return { rooms, walls, doors: doors.doors, windows: windows.windows, problems: [...doors.problems, ...windows.problems] };
}

function shift(point: Position2D, offset: Position2D): Position2D {
  return { x: point.x - offset.x, z: point.z - offset.z };
}

/** Moves everything so the outermost wall faces touch x = 0 and z = 0; returns the bounding size. */
function normalise(geometry: TraceGeometry) {
  const boxes = [...geometry.rooms.map(rectangleBox), ...geometry.walls.map((wall) => {
    const half = wall.thickness / 2;
    return wallAxis(wall) === "x" ? { minX: wall.start.x, maxX: wall.end.x, minZ: wall.start.z - half, maxZ: wall.start.z + half } : { minX: wall.start.x - half, maxX: wall.start.x + half, minZ: wall.start.z, maxZ: wall.end.z };
  })];
  const offset = { x: Math.min(...boxes.map((box) => box.minX)), z: Math.min(...boxes.map((box) => box.minZ)) };
  return {
    width: Math.max(...boxes.map((box) => box.maxX)) - offset.x,
    depth: Math.max(...boxes.map((box) => box.maxZ)) - offset.z,
    rooms: geometry.rooms.map((room) => ({ ...room, position: shift(room.position, offset) })),
    walls: geometry.walls.map((wall) => ({ ...wall, start: shift(wall.start, offset), end: shift(wall.end, offset) })),
    doors: geometry.doors.map((door) => ({ ...door, position: shift(door.position, offset) })),
    windows: geometry.windows.map((window) => ({ ...window, position: shift(window.position, offset) })),
  };
}

/**
 * Generates walls and openings from a trace, validates it and, when nothing blocks it, builds a flat
 * normalised to the origin. The result passes the same strict check as an opened flat file.
 */
export function buildFlat(plan: TracePlan, meta: BuildMeta): BuildResult {
  const geometry = traceGeometry(plan, meta.defaultOuter);
  const issues = validateTrace({ plan, rooms: geometry.rooms, walls: geometry.walls, doors: geometry.doors, problems: geometry.problems, flatType: meta.flatType, declaredAreaM2: meta.declaredAreaM2 });
  const areaM2 = plan.rooms.length > 0 ? internalAreaM2(geometry.rooms, geometry.walls) : 0;
  if (issues.some((issue) => issue.severity === "error")) return { flat: null, issues, geometry, areaM2 };
  const normalised = normalise(geometry);
  const partitions = normalised.walls.filter((wall) => !wall.outer).map((wall) => wall.thickness).sort((first, second) => first - second);
  const order = namingOrder(plan).map((entry) => entry.index);
  const candidate: Flat = {
    id: meta.id ?? "traced-flat",
    name: meta.name,
    width: normalised.width,
    depth: normalised.depth,
    height: meta.ceilingHeight,
    minimumHeight: TRACED_CEILING.minimum,
    maximumHeight: TRACED_CEILING.maximum,
    dimensionSource: "user-traced",
    wallThickness: partitions[Math.floor(partitions.length / 2)] ?? 10,
    rooms: order.map((index) => normalised.rooms[index]),
    walls: normalised.walls,
    doors: normalised.doors,
    windows: normalised.windows,
    trace: { ...meta.trace, uncheckedEdges: issues.find((issue) => issue.code === "unchecked-edges")?.count ?? 0 },
  };
  try {
    return { flat: readFlat(candidate), issues, geometry, areaM2 };
  } catch (error) {
    return { flat: null, issues: [...issues, traceIssue("inconsistent", [], { detail: error instanceof Error ? error.message : String(error) })], geometry, areaM2 };
  }
}
