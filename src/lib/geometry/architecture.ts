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