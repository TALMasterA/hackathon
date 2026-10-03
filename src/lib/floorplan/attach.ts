import { wallDirection } from "../geometry/architecture";
import { pointInPolygon, rectanglePolygon } from "../geometry/oriented";
import { edgeAngle, frameForAngle } from "../geometry/polygon";
import type { Door, FlatRoom, FlatWindow, Position2D, RoomKind, Wall } from "../../types/domain";
import { doorName, windowName } from "./names";

/** A door centre may sit this far beyond its wall's faces, e.g. a point picked on the swing arc. */
const DOOR_REACH_CM = 10;
const WINDOW_REACH_CM = 30;
const SIDE_PROBE_CM = 5;
/** Wider than any flat door; a wider opening is a mistake or an open-plan join, not a door. */
export const MAX_DOOR_WIDTH_CM = 200;

/** Sill and window heights by room kind, following the demo flat's windows. */
export const WINDOW_DEFAULTS: Record<RoomKind, { sillHeight: number; height: number }> = {
  living: { sillHeight: 100, height: 90 },
  bedroom: { sillHeight: 100, height: 90 },
  kitchen: { sillHeight: 110, height: 85 },
  bathroom: { sillHeight: 140, height: 60 },
  other: { sillHeight: 100, height: 90 },
};

export type OpeningProblemCode = "door-off-wall" | "door-too-wide" | "door-nowhere" | "window-off-wall";

export interface OpeningProblem {
  code: OpeningProblemCode;
  id: string;
}

export interface OpeningInput {
  id: string;
  at: Position2D;
  width: number;
}

export interface WallHit {
  wall: Wall;
  /** Distance from the wall's start along its centre line. */
  along: number;
  /** Signed distance from the centre line, positive on the wall's high side (see wallNormal). */
  across: number;
  length: number;
}

/**
 * The unit vector across a wall towards its "high" side: +z for a horizontal wall, +x for a vertical
 * one, and the generated walls' own cross direction at other angles, so "low" is the smaller side.
 */
export function wallNormal(wall: Wall): Position2D {
  return frameForAngle(edgeAngle(wall.start, wall.end)).m;
}

export function wallHit(wall: Wall, at: Position2D): WallHit {
  const direction = wallDirection(wall);
  const normal = wallNormal(wall);
  const offset = { x: at.x - wall.start.x, z: at.z - wall.start.z };
  return { wall, along: offset.x * direction.x + offset.z * direction.z, across: offset.x * normal.x + offset.z * normal.z, length: Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) };
}

/** The point on a wall's centre line at a distance along it. */
export function wallPoint(wall: Wall, along: number, across = 0): Position2D {
  const direction = wallDirection(wall);
  const normal = wallNormal(wall);
  return { x: wall.start.x + direction.x * along + normal.x * across, z: wall.start.z + direction.z * along + normal.z * across };
}

export function nearestWall(walls: readonly Wall[], at: Position2D, reach: number, accept: (wall: Wall) => boolean = () => true): WallHit | null {
  return walls.filter(accept).map((wall) => wallHit(wall, at))
    .filter((hit) => Math.abs(hit.across) <= hit.wall.thickness / 2 + reach && hit.along >= 0 && hit.along <= hit.length)
    .sort((first, second) => Math.abs(first.across) - Math.abs(second.across))[0] ?? null;
}

export function roomAt(rooms: readonly FlatRoom[], point: Position2D): FlatRoom | null {
  return rooms.find((room) => pointInPolygon(point, room.outline ?? rectanglePolygon(room))) ?? null;
}

/** The rooms on the wall's two sides at one point along it: [-normal side, +normal side], null for outside. */
export function sides(rooms: readonly FlatRoom[], wall: Wall, along: number): [FlatRoom | null, FlatRoom | null] {
  const offset = wall.thickness / 2 + SIDE_PROBE_CM;
  return [roomAt(rooms, wallPoint(wall, along, -offset)), roomAt(rooms, wallPoint(wall, along, offset))];
}

/** How far along the wall an opening's centre can sit so it fits; null when the wall is too short. */
function fittedAlong(hit: WallHit, width: number): number | null {
  const [from, to] = [width / 2, hit.length - width / 2];
  if (from > to + 1e-9) return null;
  return Math.min(to, Math.max(from, hit.along));
}

const tidy = (value: number) => Math.round(value * 1000) / 1000;
const tidyPoint = (point: Position2D): Position2D => ({ x: tidy(point.x), z: tidy(point.z) });
const unit = (point: Position2D): Position2D => ({ x: tidy(point.x) || 0, z: tidy(point.z) || 0 });

export interface DoorInput extends OpeningInput {
  /** Flat room ID the leaf swings into, or "outside" for an entrance that opens outward. */
  swingInto?: string;
  /** The end of the opening the hinge is at, along the wall's start-to-end direction. Default low. */
  hinge?: "low" | "high";
}

/**
 * Puts each traced door on its nearest wall, records which rooms it connects ("outside" for the
 * entrance), and fixes its leaf: the hinge at the low or high end on the swing side's face, the leaf
 * closing along the wall and opening into the room asked for, else the room inside the flat, else the
 * room that is not the living room.
 */
export function attachDoors(rooms: readonly FlatRoom[], walls: readonly Wall[], doors: readonly DoorInput[]): { doors: Door[]; problems: OpeningProblem[] } {
  const attached: Door[] = [];
  const problems: OpeningProblem[] = [];
  for (const door of doors) {
    const hit = nearestWall(walls, door.at, DOOR_REACH_CM);
    if (!hit) {
      problems.push({ code: "door-off-wall", id: door.id });
      continue;
    }
    const along = door.width <= MAX_DOOR_WIDTH_CM ? fittedAlong(hit, door.width) : null;
    if (along === null) {
      problems.push({ code: "door-too-wide", id: door.id });
      continue;
    }
    const [low, high] = sides(rooms, hit.wall, along);
    if ((!low && !high) || low === high) {
      problems.push({ code: "door-nowhere", id: door.id });
      continue;
    }
    const inside = [low, high].filter((room): room is FlatRoom => room !== null);
    const swing = inside.find((room) => room.id === door.swingInto) ?? (inside.length === 1 ? inside[0] : inside.find((room) => room.kind !== "living") ?? inside[1]);
    const outward = door.swingInto === "outside" && inside.length === 1;
    const swingRoomSide = swing === low ? -1 : 1;
    const side = outward ? -swingRoomSide : swingRoomSide;
    const normal = wallNormal(hit.wall);
    const direction = wallDirection(hit.wall);
    const hingeEnd = door.hinge === "high" ? 1 : -1;
    const hinge = wallPoint(hit.wall, along + hingeEnd * door.width / 2, side * hit.wall.thickness / 2);
    attached.push({
      id: door.id,
      name: doorName(inside.length === 1 ? null : swing.name),
      wallId: hit.wall.id,
      position: tidyPoint(wallPoint(hit.wall, along)),
      width: door.width,
      swingRoomId: swing.id,
      connects: low && high ? [low.id, high.id] : ["outside", inside[0].id],
      hinge: tidyPoint(hinge),
      closedDirection: unit({ x: -hingeEnd * direction.x, z: -hingeEnd * direction.z }),
      openDirection: unit({ x: side * normal.x, z: side * normal.z }),
    });
  }
  return { doors: attached, problems };
}

/** Puts each traced window on the nearest outer wall of its room, narrowing it if the wall is shorter. */
export function attachWindows(rooms: readonly FlatRoom[], walls: readonly Wall[], windows: readonly (OpeningInput & { roomId: string })[]): { windows: FlatWindow[]; problems: OpeningProblem[] } {
  const attached: FlatWindow[] = [];
  const problems: OpeningProblem[] = [];
  const counts = new Map<string, number>();
  for (const window of windows) counts.set(window.roomId, (counts.get(window.roomId) ?? 0) + 1);
  const numbers = new Map<string, number>();
  for (const window of windows) {
    const room = rooms.find((entry) => entry.id === window.roomId);
    const hit = room && nearestWall(walls, window.at, WINDOW_REACH_CM, (wall) => wall.outer && sides(rooms, wall, wallHit(wall, window.at).along).includes(room));
    if (!room || !hit) {
      problems.push({ code: "window-off-wall", id: window.id });
      continue;
    }
    const width = Math.min(window.width, hit.length);
    const number = (numbers.get(room.id) ?? 0) + 1;
    numbers.set(room.id, number);
    attached.push({
      id: window.id,
      name: windowName(room.name, (counts.get(room.id) ?? 0) > 1 ? number : null),
      wallId: hit.wall.id,
      roomId: room.id,
      position: tidyPoint(wallPoint(hit.wall, fittedAlong(hit, width)!)),
      width,
      ...WINDOW_DEFAULTS[room.kind ?? "other"],
    });
  }
  return { windows: attached, problems };
}
