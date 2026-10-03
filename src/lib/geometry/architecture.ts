import type { Door, Flat, FlatRoom, LocalizedName, OrientedRectangle, Position2D, Wall } from "../../types/domain";

export interface WallPart extends OrientedRectangle {
  id: string;
  wallId: string;
  name: LocalizedName;
  outer: boolean;
}

export function wallAxis(wall: Wall): "x" | "z" {
  return wall.start.z === wall.end.z ? "x" : "z";
}

export function wallParts(flat: Flat): WallPart[] {
  return flat.walls.flatMap((wall) => {
    const axis = wallAxis(wall);
    const gaps = flat.doors.filter((door) => door.wallId === wall.id)
      .map((door) => [door.position[axis] - door.width / 2, door.position[axis] + door.width / 2] as const)
      .sort((first, second) => first[0] - second[0]);
    const ranges: [number, number][] = [];
    let cursor = wall.start[axis];
    for (const [start, end] of gaps) {
      if (start > cursor) ranges.push([cursor, start]);
      cursor = end;
    }
    if (cursor < wall.end[axis]) ranges.push([cursor, wall.end[axis]]);
    return ranges.map(([start, end], index) => ({
      id: `${wall.id}-${index}`,
      wallId: wall.id,
      name: wall.name,
      outer: wall.outer,
      width: axis === "x" ? end - start : wall.thickness,
      depth: axis === "z" ? end - start : wall.thickness,
      position: axis === "x" ? { x: (start + end) / 2, z: wall.start.z } : { x: wall.start.x, z: (start + end) / 2 },
      orientation: 0,
    }));
  });
}

export function doorGeometry(door: Door, flat: Flat) {
  const wall = flat.walls.find((entry) => entry.id === door.wallId);
  const room = flat.rooms.find((entry) => entry.id === door.swingRoomId);
  if (!wall || !room) throw new Error(`Invalid door reference: ${door.id}`);
  const axis = wallAxis(wall);
  const normal = axis === "x" ? { x: 0, z: Math.sign(room.position.z - wall.start.z) } : { x: Math.sign(room.position.x - wall.start.x), z: 0 };
  const hinge = { x: door.position.x - (axis === "x" ? door.width / 2 : 0), z: door.position.z - (axis === "z" ? door.width / 2 : 0) };
  const closedEnd = { x: hinge.x + (axis === "x" ? door.width : 0), z: hinge.z + (axis === "z" ? door.width : 0) };
  const openEnd = { x: hinge.x + normal.x * door.width, z: hinge.z + normal.z * door.width };
  const zone: OrientedRectangle = {
    width: door.width,
    depth: door.width,
    position: { x: door.position.x + normal.x * (wall.thickness / 2 + door.width / 2), z: door.position.z + normal.z * (wall.thickness / 2 + door.width / 2) },
    orientation: 0,
  };
  return { hinge, closedEnd, openEnd, normal, zone, sweep: axis === "x" ? normal.z > 0 ? 1 : 0 : normal.x > 0 ? 0 : 1 };
}

export function containingRoom(flat: Flat, position: Position2D): FlatRoom | undefined {
  return flat.rooms.find((room) => position.x >= room.position.x - room.width / 2 && position.x <= room.position.x + room.width / 2 && position.z >= room.position.z - room.depth / 2 && position.z <= room.position.z + room.depth / 2);
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A gap between facing room edges up to this width is wall or opening, never space outside the flat. */
export const WALL_GAP_MAX_CM = 35;
/** Uncovered strips narrower than this are rounding left between traced walls, not a real notch. */
const VOID_MIN_CM = 5;
const COVER_TOLERANCE_CM = 0.01;

export function rectangleBox(rectangle: OrientedRectangle): Box {
  return { minX: rectangle.position.x - rectangle.width / 2, maxX: rectangle.position.x + rectangle.width / 2, minZ: rectangle.position.z - rectangle.depth / 2, maxZ: rectangle.position.z + rectangle.depth / 2 };
}

export function boxRectangle(box: Box): OrientedRectangle {
  return { position: { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 }, width: box.maxX - box.minX, depth: box.maxZ - box.minZ, orientation: 0 };
}

function wallBox(wall: Wall): Box {
  const half = wall.thickness / 2;
  return wallAxis(wall) === "x"
    ? { minX: Math.min(wall.start.x, wall.end.x), maxX: Math.max(wall.start.x, wall.end.x), minZ: wall.start.z - half, maxZ: wall.start.z + half }
    : { minX: wall.start.x - half, maxX: wall.start.x + half, minZ: Math.min(wall.start.z, wall.end.z), maxZ: Math.max(wall.start.z, wall.end.z) };
}

/** Strips between pairs of rooms that face each other across a wall-sized gap. */
function facingStrips(rooms: readonly Box[]): Box[] {
  const strips: Box[] = [];
  for (const first of rooms) {
    for (const second of rooms) {
      const gapX = second.minX - first.maxX;
      const overlapZ = [Math.max(first.minZ, second.minZ), Math.min(first.maxZ, second.maxZ)];
      if (gapX > 0 && gapX <= WALL_GAP_MAX_CM && overlapZ[1] > overlapZ[0]) strips.push({ minX: first.maxX, maxX: second.minX, minZ: overlapZ[0], maxZ: overlapZ[1] });
      const gapZ = second.minZ - first.maxZ;
      const overlapX = [Math.max(first.minX, second.minX), Math.min(first.maxX, second.maxX)];
      if (gapZ > 0 && gapZ <= WALL_GAP_MAX_CM && overlapX[1] > overlapX[0]) strips.push({ minX: overlapX[0], maxX: overlapX[1], minZ: first.maxZ, maxZ: second.minZ });
    }
  }
  return strips;
}

type VoidSource = Pick<Flat, "width" | "depth" | "rooms" | "walls">;
const voidCache = new WeakMap<readonly FlatRoom[], { walls: readonly Wall[]; width: number; depth: number; voids: OrientedRectangle[] }>();

/**
 * Parts of the flat's bounding box that are neither a room, a wall nor a gap between facing rooms,
 * e.g. the notch of an L-shaped flat. The envelope check alone only knows the bounding box.
 */
export function flatVoids(flat: VoidSource): OrientedRectangle[] {
  const cached = voidCache.get(flat.rooms);
  if (cached && cached.walls === flat.walls && cached.width === flat.width && cached.depth === flat.depth) return cached.voids;
  const rooms = flat.rooms.map(rectangleBox);
  const covered = [...rooms, ...flat.walls.map(wallBox), ...facingStrips(rooms)];
  const clampTo = (value: number, size: number) => Math.min(size, Math.max(0, value));
  const xs = [...new Set([0, flat.width, ...covered.flatMap((box) => [clampTo(box.minX, flat.width), clampTo(box.maxX, flat.width)])])].sort((first, second) => first - second);
  const zs = [...new Set([0, flat.depth, ...covered.flatMap((box) => [clampTo(box.minZ, flat.depth), clampTo(box.maxZ, flat.depth)])])].sort((first, second) => first - second);
  const isCovered = (x: number, z: number) => covered.some((box) => x >= box.minX - COVER_TOLERANCE_CM && x <= box.maxX + COVER_TOLERANCE_CM && z >= box.minZ - COVER_TOLERANCE_CM && z <= box.maxZ + COVER_TOLERANCE_CM);
  // Uncovered grid cells joined into runs along each row, then runs with equal ends stacked down the rows.
  let open: Box[] = [];
  const voids: Box[] = [];
  for (let row = 0; row < zs.length - 1; row++) {
    const runs: Box[] = [];
    for (let column = 0; column < xs.length - 1; column++) {
      if (isCovered((xs[column] + xs[column + 1]) / 2, (zs[row] + zs[row + 1]) / 2)) continue;
      const last = runs.at(-1);
      if (last && last.maxX === xs[column]) last.maxX = xs[column + 1];
      else runs.push({ minX: xs[column], maxX: xs[column + 1], minZ: zs[row], maxZ: zs[row + 1] });
    }
    const next: Box[] = [];
    for (const run of runs) {
      const above = open.find((box) => box.minX === run.minX && box.maxX === run.maxX);
      if (above) {
        above.maxZ = run.maxZ;
        next.push(above);
      } else next.push(run);
    }
    voids.push(...open.filter((box) => !next.includes(box)));
    open = next;
  }
  voids.push(...open);
  const result = voids.filter((box) => Math.min(box.maxX - box.minX, box.maxZ - box.minZ) >= VOID_MIN_CM).map(boxRectangle);
  voidCache.set(flat.rooms, { walls: flat.walls, width: flat.width, depth: flat.depth, voids: result });
  return result;
}