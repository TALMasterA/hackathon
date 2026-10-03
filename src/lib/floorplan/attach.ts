import { rectangleBox, wallAxis } from "../geometry/architecture";
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

interface WallHit {
  wall: Wall;
  along: number;
  across: number;
}

function wallHit(wall: Wall, at: Position2D): WallHit {
  const axis = wallAxis(wall);
  return axis === "x" ? { wall, along: at.x, across: at.z - wall.start.z } : { wall, along: at.z, across: at.x - wall.start.x };
}

function nearestWall(walls: readonly Wall[], at: Position2D, reach: number, accept: (wall: Wall) => boolean = () => true): WallHit | null {
  return walls.filter(accept).map((wall) => wallHit(wall, at))
    .filter((hit) => {
      const axis = wallAxis(hit.wall);
      return Math.abs(hit.across) <= hit.wall.thickness / 2 + reach && hit.along >= hit.wall.start[axis] && hit.along <= hit.wall.end[axis];
    })
    .sort((first, second) => Math.abs(first.across) - Math.abs(second.across))[0] ?? null;
}

function roomAt(rooms: readonly FlatRoom[], point: Position2D): FlatRoom | null {
  return rooms.find((room) => {
    const box = rectangleBox(room);
    return point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
  }) ?? null;
}

/** The rooms on the low and high side of a wall at one point along it ("outside" when none). */
function sides(rooms: readonly FlatRoom[], wall: Wall, along: number): [FlatRoom | null, FlatRoom | null] {
  const offset = wall.thickness / 2 + SIDE_PROBE_CM;
  const point = (sign: number): Position2D => wallAxis(wall) === "x" ? { x: along, z: wall.start.z + sign * offset } : { x: wall.start.x + sign * offset, z: along };
  return [roomAt(rooms, point(-1)), roomAt(rooms, point(1))];
}

/** Centre of an opening on the wall's centre line, moved inward just enough to fit; null when the wall is too short. */
function fitted(hit: WallHit, width: number): Position2D | null {
  const axis = wallAxis(hit.wall);
  const [from, to] = [hit.wall.start[axis] + width / 2, hit.wall.end[axis] - width / 2];
  if (from > to) return null;
  const along = Math.min(to, Math.max(from, hit.along));
  return axis === "x" ? { x: along, z: hit.wall.start.z } : { x: hit.wall.start.x, z: along };
}

/**
 * Puts each traced door on its nearest wall, records which rooms it connects ("outside" for the
 * entrance) and the room its leaf swings into: the one asked for, else the room inside the flat, else
 * the room that is not the living room.
 */
export function attachDoors(rooms: readonly FlatRoom[], walls: readonly Wall[], doors: readonly (OpeningInput & { swingInto?: string })[]): { doors: Door[]; problems: OpeningProblem[] } {
  const attached: Door[] = [];
  const problems: OpeningProblem[] = [];
  for (const door of doors) {
    const hit = nearestWall(walls, door.at, DOOR_REACH_CM);
    if (!hit) {
      problems.push({ code: "door-off-wall", id: door.id });
      continue;
    }
    const position = door.width <= MAX_DOOR_WIDTH_CM ? fitted(hit, door.width) : null;
    if (!position) {
      problems.push({ code: "door-too-wide", id: door.id });
      continue;
    }
    const [low, high] = sides(rooms, hit.wall, wallAxis(hit.wall) === "x" ? position.x : position.z);
    if ((!low && !high) || low === high) {
      problems.push({ code: "door-nowhere", id: door.id });
      continue;
    }
    const inside = [low, high].filter((room): room is FlatRoom => room !== null);
    const swing = inside.find((room) => room.id === door.swingInto) ?? (inside.length === 1 ? inside[0] : inside.find((room) => room.kind !== "living") ?? inside[1]);
    attached.push({
      id: door.id,
      name: doorName(inside.length === 1 ? null : swing.name),
      wallId: hit.wall.id,
      position,
      width: door.width,
      swingRoomId: swing.id,
      connects: low && high ? [low.id, high.id] : ["outside", inside[0].id],
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
    const hit = room && nearestWall(walls, window.at, WINDOW_REACH_CM, (wall) => wall.outer && sides(rooms, wall, wallAxis(wall) === "x" ? window.at.x : window.at.z).includes(room));
    if (!room || !hit) {
      problems.push({ code: "window-off-wall", id: window.id });
      continue;
    }
    const axis = wallAxis(hit.wall);
    const width = Math.min(window.width, hit.wall.end[axis] - hit.wall.start[axis]);
    const number = (numbers.get(room.id) ?? 0) + 1;
    numbers.set(room.id, number);
    attached.push({
      id: window.id,
      name: windowName(room.name, (counts.get(room.id) ?? 0) > 1 ? number : null),
      wallId: hit.wall.id,
      roomId: room.id,
      position: fitted(hit, width)!,
      width,
      ...WINDOW_DEFAULTS[room.kind ?? "other"],
    });
  }
  return { windows: attached, problems };
}
