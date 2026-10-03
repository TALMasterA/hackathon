import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { rectangleBox, type Box, wallAxis } from "../geometry/architecture";
import type { Wall } from "../../types/domain";
import { L_FLAT } from "./test-flats";
import { boxRoom, edges, type EdgeSide, type TraceEdge } from "./trace";
import { wallsFromRooms, type WallRoom } from "./walls";

const geometry = (walls: readonly Wall[]) => walls.map(({ start, end, thickness, outer }) => ({ start, end, thickness, outer }))
  .sort((first, second) => first.start.x - second.start.x || first.start.z - second.start.z || first.end.x - second.end.x || first.end.z - second.end.z);
const box = (minX: number, minZ: number, maxX: number, maxZ: number): Box => ({ minX, minZ, maxX, maxZ });
const wallRoom = (id: string, area: Box, sides?: Partial<Record<EdgeSide, TraceEdge>>): WallRoom => boxRoom(id, "other", area, sides);
const partitions = (walls: readonly Wall[]) => geometry(walls.filter((wall) => !wall.outer));

describe("walls generated from traced rooms", () => {
  it("reproduces the demo flat's eight hand-made walls exactly from its rooms", () => {
    const walls = wallsFromRooms(DEMO_FLAT.rooms.map((room) => (wallRoom(room.id, rectangleBox(room)))), { defaultOuter: 10 });
    expect(geometry(walls)).toEqual(geometry(DEMO_FLAT.walls));
  });

  it("gives two rooms across a 10 cm gap one shared wall centred in the gap", () => {
    const walls = wallsFromRooms([wallRoom("a", box(0, 0, 300, 200)), wallRoom("b", box(310, 0, 500, 200))], { defaultOuter: 20 });
    expect(partitions(walls)).toEqual([{ start: { x: 305, z: 0 }, end: { x: 305, z: 200 }, thickness: 10, outer: false }]);
    expect(geometry(walls.filter((wall) => wall.outer))).toEqual([
      { start: { x: -20, z: -10 }, end: { x: 520, z: -10 }, thickness: 20, outer: true },
      { start: { x: -20, z: 210 }, end: { x: 520, z: 210 }, thickness: 20, outer: true },
      { start: { x: -10, z: -20 }, end: { x: -10, z: 220 }, thickness: 20, outer: true },
      { start: { x: 510, z: -20 }, end: { x: 510, z: 220 }, thickness: 20, outer: true },
    ]);
  });

  it("keeps every wall exactly axis-aligned and running from start to end", () => {
    for (const wall of wallsFromRooms(L_FLAT.rooms.map((room) => (wallRoom(room.id, rectangleBox(room)))), { defaultOuter: 10 })) {
      const axis = wallAxis(wall);
      expect(axis === "x" ? wall.start.z === wall.end.z : wall.start.x === wall.end.x).toBe(true);
      expect(wall.end[axis]).toBeGreaterThan(wall.start[axis]);
    }
  });

  it("builds the wall only where a partly overlapping neighbour faces the edge", () => {
    const walls = wallsFromRooms([wallRoom("long", box(0, 0, 400, 300)), wallRoom("short", box(0, 310, 150, 500))], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([{ start: { x: 0, z: 305 }, end: { x: 150, z: 305 }, thickness: 10, outer: false }]);
    // The rest of the long room's back edge faces the outside.
    expect(walls.some((wall) => wall.outer && wall.start.z === 305 && wall.start.x <= 150 && wall.end.x >= 400)).toBe(true);
  });

  it("puts no wall between rooms joined as an open pair or touching faces", () => {
    const rooms: WallRoom[] = L_FLAT.rooms.map((room) => (wallRoom(room.id, rectangleBox(room))));
    const open = wallsFromRooms(rooms, { defaultOuter: 10, openPairs: [["living", "bedroom"]] });
    expect(partitions(open).some((wall) => wall.start.z === 315)).toBe(false);
    const touching = wallsFromRooms([wallRoom("a", box(0, 0, 200, 200)), wallRoom("b", box(203, 0, 400, 200))], { defaultOuter: 10 });
    expect(partitions(touching)).toEqual([]);
  });

  it("treats rooms more than 35 cm apart as separately walled, with outside between them", () => {
    const walls = wallsFromRooms([wallRoom("a", box(0, 0, 200, 200)), wallRoom("b", box(240, 0, 400, 200))], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([]);
    expect(walls.filter((wall) => wall.outer && wall.start.x === wall.end.x).map((wall) => wall.start.x).sort((first, second) => first - second)).toEqual([-5, 205, 235, 405]);
  });

  it("joins collinear pieces across a junction but not across a wider gap", () => {
    const walls = wallsFromRooms([wallRoom("a", box(0, 0, 200, 200)), wallRoom("b", box(230, 0, 400, 200)), wallRoom("c", box(0, 210, 400, 400))], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([
      { start: { x: 0, z: 205 }, end: { x: 400, z: 205 }, thickness: 10, outer: false },
      { start: { x: 215, z: 0 }, end: { x: 215, z: 200 }, thickness: 30, outer: false },
    ]);
  });

  it("walls an L-shaped room on all six edges, closing its corners and overlapping at the inside corner", () => {
    const room: WallRoom = { id: "l", points: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 200 }, { x: 200, z: 200 }, { x: 200, z: 400 }, { x: 0, z: 400 }] };
    expect(geometry(wallsFromRooms([room], { defaultOuter: 20 }))).toEqual(geometry([
      { start: { x: -20, z: -10 }, end: { x: 420, z: -10 } },
      { start: { x: 410, z: -20 }, end: { x: 410, z: 220 } },
      { start: { x: 200, z: 210 }, end: { x: 420, z: 210 } },
      { start: { x: 210, z: 200 }, end: { x: 210, z: 420 } },
      { start: { x: -20, z: 410 }, end: { x: 220, z: 410 } },
      { start: { x: -10, z: -20 }, end: { x: -10, z: 420 } },
    ].map((wall) => ({ ...wall, thickness: 20, outer: true, id: "", name: { en: "", "zh-Hant": "" } }))));
  });

  it("gives two rooms facing across a 10 cm gap at 45 degrees one diagonal wall centred in the gap", () => {
    const far = 300 + 10 * Math.SQRT2;
    const triangle: WallRoom = { id: "a", points: [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 0, z: 300 }] };
    const beyond: WallRoom = { id: "b", points: [{ x: far, z: 0 }, { x: far, z: far }, { x: 0, z: far }] };
    const [partition, ...others] = wallsFromRooms([triangle, beyond], { defaultOuter: 10 }).filter((wall) => !wall.outer);
    expect(others).toEqual([]);
    expect(partition.thickness).toBeCloseTo(10, 6);
    // Its centre line is x + z = 300 + 5√2, running the whole shared length.
    for (const point of [partition.start, partition.end]) expect(point.x + point.z).toBeCloseTo(300 + 5 * Math.SQRT2, 2);
    expect(Math.hypot(partition.end.x - partition.start.x, partition.end.z - partition.start.z)).toBeCloseTo(300 * Math.SQRT2, 1);
  });

  it("extends the walls of a 45-degree corner so the corner is closed", () => {
    const walls = wallsFromRooms([{ id: "a", points: [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 0, z: 300 }] }], { defaultOuter: 20 });
    const top = walls.find((wall) => wall.start.z === -10 && wall.end.z === -10)!;
    // The top wall's centre line runs on to the diagonal wall's outside face, x + z = 300 + 20√2.
    expect(top.end.x).toBeCloseTo(310 + 20 * Math.SQRT2, 2);
    expect(walls.filter((wall) => wall.start.x !== wall.end.x && wall.start.z !== wall.end.z)).toHaveLength(1);
  });

  it("uses each outer edge's measured thickness, and their median where nothing was matched", () => {
    const rooms: WallRoom[] = [wallRoom("a", box(0, 0, 300, 300), { ...edges("unverified"), top: { status: "verified", thickness: 25 }, left: { status: "verified", thickness: 19.8 }, bottom: { status: "verified", thickness: 21 } })];
    const thickness = (predicate: (wall: Wall) => boolean) => wallsFromRooms(rooms, { defaultOuter: 10 }).find(predicate)?.thickness;
    expect(thickness((wall) => wall.start.z === -12.5)).toBe(25);
    expect(thickness((wall) => wall.start.x === -10)).toBe(20);
    expect(thickness((wall) => wall.start.z === 310.5)).toBe(21);
    // The unmatched right edge takes the median of 25, 20 and 21.
    expect(thickness((wall) => wall.start.x === 310.5)).toBe(21);
  });
});
