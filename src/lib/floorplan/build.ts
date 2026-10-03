import { boxRectangle, isAxisWall, wallPolygon } from "../geometry/architecture";
import { polygonBounds } from "../geometry/oriented";
import { unionOuterRing } from "../geometry/polygon";
import type { Door, Flat, FlatRoom, FlatTrace, FlatWindow, LocalizedName, Position2D, Wall } from "../../types/domain";
import { attachDoors, attachWindows, type OpeningProblem } from "./attach";
import { readFlat } from "./flat-file";
import { ROOM_KINDS, roomIdentities } from "./names";
import { isBoxRoom, roomBounds, type FlatType, type TracePlan } from "./trace";
import { internalAreaM2, traceIssue, validateTrace, type TraceIssue } from "./validate";
import { facingEdges, frameEdges, framePoint, wallsFromRooms } from "./walls";

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
  /** The flat's outer boundary, when a room is not a box or a wall runs at an angle. */
  outline?: Position2D[];
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
  return plan.rooms.map((room, index) => ({ room, index, bounds: roomBounds(room) }))
    .sort((first, second) => ROOM_KINDS.indexOf(first.room.kind) - ROOM_KINDS.indexOf(second.room.kind) || first.bounds.minZ - second.bounds.minZ || first.bounds.minX - second.bounds.minX);
}

/**
 * The flat's outer boundary: the union of its rooms, its walls and the strips between facing rooms
 * (open joins and touching faces have no wall to fill them).
 */
function flatOutline(plan: TracePlan, walls: readonly Wall[]): Position2D[] | null {
  const edges = frameEdges(plan.rooms);
  const strips = edges.flatMap((edge) => facingEdges(edge, edges).filter((facing) => facing.gap > 0).map((facing) => [
    framePoint(edge.frame, facing.from, edge.face),
    framePoint(edge.frame, facing.to, edge.face),
    framePoint(edge.frame, facing.to, facing.other.face),
    framePoint(edge.frame, facing.from, facing.other.face),
  ]));
  return unionOuterRing([...plan.rooms.map((room) => room.points), ...walls.map(wallPolygon), ...strips]);
}

export function traceGeometry(plan: TracePlan, defaultOuter?: number): TraceGeometry {
  const order = namingOrder(plan);
  const identities = roomIdentities(order.map((entry) => entry.room));
  const identity = new Map(order.map((entry, position) => [entry.room.id, identities[position]]));
  const rooms: FlatRoom[] = plan.rooms.map((room) => ({ ...identity.get(room.id)!, kind: room.kind, ...boxRectangle(roomBounds(room)), ...(isBoxRoom(room) ? {} : { outline: room.points.map((point) => ({ ...point })) }) }));
  const flatId = (traceId: string | undefined) => traceId === undefined ? undefined : traceId === "outside" ? "outside" : identity.get(traceId)?.id;
  const walls = wallsFromRooms(plan.rooms, { openPairs: plan.openPairs, defaultOuter });
  const doors = attachDoors(rooms, walls, plan.doors.map((door) => ({ id: door.id, at: door.at, width: door.width, swingInto: flatId(door.swingInto), hinge: door.hinge })));
  const windows = attachWindows(rooms, walls, plan.windows.map((window) => ({ id: window.id, at: window.at, width: window.width, roomId: flatId(window.roomId) ?? window.roomId })));
  const needsOutline = rooms.some((room) => room.outline) || walls.some((wall) => !isAxisWall(wall));
  const outline = needsOutline && plan.rooms.length > 0 ? flatOutline(plan, walls) : null;
  return { rooms, walls, doors: doors.doors, windows: windows.windows, problems: [...doors.problems, ...windows.problems], ...(outline ? { outline } : {}) };
}

function shift(point: Position2D, offset: Position2D): Position2D {
  return { x: point.x - offset.x, z: point.z - offset.z };
}

/** Moves everything so the outermost wall faces touch x = 0 and z = 0; returns the bounding size. */
function normalise(geometry: TraceGeometry) {
  const bounds = polygonBounds([...geometry.rooms.flatMap((room) => [{ x: room.position.x - room.width / 2, z: room.position.z - room.depth / 2 }, { x: room.position.x + room.width / 2, z: room.position.z + room.depth / 2 }]), ...geometry.walls.flatMap(wallPolygon), ...(geometry.outline ?? [])]);
  const offset = { x: bounds.minX, z: bounds.minZ };
  const move = (point: Position2D) => shift(point, offset);
  return {
    width: bounds.maxX - offset.x,
    depth: bounds.maxZ - offset.z,
    rooms: geometry.rooms.map((room) => ({ ...room, position: move(room.position), ...(room.outline ? { outline: room.outline.map(move) } : {}) })),
    walls: geometry.walls.map((wall) => ({ ...wall, start: move(wall.start), end: move(wall.end) })),
    doors: geometry.doors.map((door) => ({ ...door, position: move(door.position), ...(door.hinge ? { hinge: move(door.hinge) } : {}) })),
    windows: geometry.windows.map((window) => ({ ...window, position: move(window.position) })),
    ...(geometry.outline ? { outline: geometry.outline.map(move) } : {}),
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
    ...(normalised.outline ? { outline: normalised.outline } : {}),
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
