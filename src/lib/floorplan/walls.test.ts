import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { rectangleBox, type Box, wallAxis } from "../geometry/architecture";
import type { Wall } from "../../types/domain";
import { L_FLAT } from "./test-flats";
import { edges } from "./trace";
import { wallsFromRooms, type WallRoom } from "./walls";

const geometry = (walls: readonly Wall[]) => walls.map(({ start, end, thickness, outer }) => ({ start, end, thickness, outer }))
  .sort((first, second) => first.start.x - second.start.x || first.start.z - second.start.z || first.end.x - second.end.x || first.end.z - second.end.z);
const box = (minX: number, minZ: number, maxX: number, maxZ: number): Box => ({ minX, minZ, maxX, maxZ });
const partitions = (walls: readonly Wall[]) => geometry(walls.filter((wall) => !wall.outer));

describe("walls generated from traced rooms", () => {
  it("reproduces the demo flat's eight hand-made walls exactly from its rooms", () => {
    const walls = wallsFromRooms(DEMO_FLAT.rooms.map((room) => ({ id: room.id, box: rectangleBox(room) })), { defaultOuter: 10 });
    expect(geometry(walls)).toEqual(geometry(DEMO_FLAT.walls));
  });

  it("gives two rooms across a 10 cm gap one shared wall centred in the gap", () => {
    const walls = wallsFromRooms([{ id: "a", box: box(0, 0, 300, 200) }, { id: "b", box: box(310, 0, 500, 200) }], { defaultOuter: 20 });
    expect(partitions(walls)).toEqual([{ start: { x: 305, z: 0 }, end: { x: 305, z: 200 }, thickness: 10, outer: false }]);
    expect(geometry(walls.filter((wall) => wall.outer))).toEqual([
      { start: { x: -20, z: -10 }, end: { x: 520, z: -10 }, thickness: 20, outer: true },
      { start: { x: -20, z: 210 }, end: { x: 520, z: 210 }, thickness: 20, outer: true },
      { start: { x: -10, z: -20 }, end: { x: -10, z: 220 }, thickness: 20, outer: true },
      { start: { x: 510, z: -20 }, end: { x: 510, z: 220 }, thickness: 20, outer: true },
    ]);
  });

  it("keeps every wall exactly axis-aligned and running from start to end", () => {
    for (const wall of wallsFromRooms(L_FLAT.rooms.map((room) => ({ id: room.id, box: rectangleBox(room) })), { defaultOuter: 10 })) {
      const axis = wallAxis(wall);
      expect(axis === "x" ? wall.start.z === wall.end.z : wall.start.x === wall.end.x).toBe(true);
      expect(wall.end[axis]).toBeGreaterThan(wall.start[axis]);
    }
  });

  it("builds the wall only where a partly overlapping neighbour faces the edge", () => {
    const walls = wallsFromRooms([{ id: "long", box: box(0, 0, 400, 300) }, { id: "short", box: box(0, 310, 150, 500) }], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([{ start: { x: 0, z: 305 }, end: { x: 150, z: 305 }, thickness: 10, outer: false }]);
    // The rest of the long room's back edge faces the outside.
    expect(walls.some((wall) => wall.outer && wall.start.z === 305 && wall.start.x <= 150 && wall.end.x >= 400)).toBe(true);
  });

  it("puts no wall between rooms joined as an open pair or touching faces", () => {
    const rooms: WallRoom[] = L_FLAT.rooms.map((room) => ({ id: room.id, box: rectangleBox(room) }));
    const open = wallsFromRooms(rooms, { defaultOuter: 10, openPairs: [["living", "bedroom"]] });
    expect(partitions(open).some((wall) => wall.start.z === 315)).toBe(false);
    const touching = wallsFromRooms([{ id: "a", box: box(0, 0, 200, 200) }, { id: "b", box: box(203, 0, 400, 200) }], { defaultOuter: 10 });
    expect(partitions(touching)).toEqual([]);
  });

  it("treats rooms more than 35 cm apart as separately walled, with outside between them", () => {
    const walls = wallsFromRooms([{ id: "a", box: box(0, 0, 200, 200) }, { id: "b", box: box(240, 0, 400, 200) }], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([]);
    expect(walls.filter((wall) => wall.outer && wall.start.x === wall.end.x).map((wall) => wall.start.x).sort((first, second) => first - second)).toEqual([-5, 205, 235, 405]);
  });

  it("joins collinear pieces across a junction but not across a wider gap", () => {
    const walls = wallsFromRooms([{ id: "a", box: box(0, 0, 200, 200) }, { id: "b", box: box(230, 0, 400, 200) }, { id: "c", box: box(0, 210, 400, 400) }], { defaultOuter: 10 });
    expect(partitions(walls)).toEqual([
      { start: { x: 0, z: 205 }, end: { x: 400, z: 205 }, thickness: 10, outer: false },
      { start: { x: 215, z: 0 }, end: { x: 215, z: 200 }, thickness: 30, outer: false },
    ]);
  });

  it("uses each outer edge's measured thickness, and their median where nothing was matched", () => {
    const rooms: WallRoom[] = [{ id: "a", box: box(0, 0, 300, 300), edges: { ...edges("unverified"), top: { status: "verified", thickness: 25 }, left: { status: "verified", thickness: 19.8 }, bottom: { status: "verified", thickness: 21 } } }];
    const thickness = (predicate: (wall: Wall) => boolean) => wallsFromRooms(rooms, { defaultOuter: 10 }).find(predicate)?.thickness;
    expect(thickness((wall) => wall.start.z === -12.5)).toBe(25);
    expect(thickness((wall) => wall.start.x === -10)).toBe(20);
    expect(thickness((wall) => wall.start.z === 310.5)).toBe(21);
    // The unmatched right edge takes the median of 25, 20 and 21.
    expect(thickness((wall) => wall.start.x === 310.5)).toBe(21);
  });
});
