import { describe, expect, it } from "vitest";
import type { SnapContext } from "./snap";
import { blankPlan, drawDoorSwing, drawWall, type WallDrawing } from "./test-image";
import { boxPoints, boxRoom, edges, roomBounds, type TracePlan } from "./trace";
import { nearestFace, scanOpenings, snapDrawnRoom, snapTraceEdge, snapTraceRooms, traceOpening } from "./trace-snap";

/** At 0.5 cm per pixel: a room with inner faces 50–200 × 50–150 cm, a 90 cm door in its top wall swinging in. */
function drawing() {
  const image = blankPlan(520, 420);
  const wall = (overrides: Partial<WallDrawing> & Pick<WallDrawing, "orientation" | "centre">): WallDrawing => ({ from: 60, to: 440, thickness: 40, line: 8, ...overrides });
  drawWall(image, wall({ orientation: "h", centre: 80, gaps: [[200, 380]] }));
  drawDoorSwing(image, "h", 104, 200, 380, 1, 2);
  drawWall(image, wall({ orientation: "h", centre: 320 }));
  drawWall(image, wall({ orientation: "v", centre: 80, to: 340 }));
  drawWall(image, wall({ orientation: "v", centre: 420, to: 340 }));
  return image;
}
const context = (): SnapContext => ({ image: drawing(), cmPerPx: 0.5, strokes: { thin: 2, heavy: 8, pens: [2, 8], distinct: true } });

describe("snapping a trace in centimetres", () => {
  it("snaps rough rooms onto the drawing on the 0.5 cm grid, with wall thickness", () => {
    const [room] = snapTraceRooms(context(), [{ id: "room-1", kind: "living", box: { minX: 58.3, maxX: 193.1, minZ: 41.2, maxZ: 158.9 } }]);
    expect(roomBounds(room)).toMatchObject({ minX: 50, maxX: 200, maxZ: 150 });
    // Box rooms list their edges top, right, bottom, left.
    expect(room.edges[2]).toEqual({ status: "verified", thickness: 20 });
    // The door takes three quarters of the top wall, so that edge is left where it was, for the user to check.
    expect(room.edges[0].status).toBe("unverified");
    expect(roomBounds(room).minZ).toBe(41);
  });

  it("puts a dragged edge on the drawn wall, or leaves it where the user put it", () => {
    const box = { minX: 50, maxX: 200, minZ: 50, maxZ: 150 };
    const room = boxRoom("room-1", "living", box, edges("verified", 20));
    expect(snapTraceEdge(context(), room, 1, { x: 193, z: 100 })).toEqual({ points: boxPoints(box), edge: { status: "verified", thickness: 20 } });
    expect(snapTraceEdge(context(), room, 1, { x: 140.3, z: 100 })).toEqual({ points: boxPoints({ ...box, maxX: 140.5 }), edge: { status: "manual" } });
  });

  it("snaps a hand-drawn shape's straight edges onto the walls and keeps its angled corner", () => {
    const drawn = { id: "room-1", kind: "living" as const, points: [{ x: 51, z: 52 }, { x: 197, z: 52 }, { x: 197, z: 120 }, { x: 160, z: 148 }, { x: 51, z: 148 }], edges: Array.from({ length: 5 }, () => ({ status: "manual" as const })) };
    const snapped = snapDrawnRoom(context(), drawn);
    expect(snapped.edges.map((edge) => edge.status)).toEqual(["manual", "verified", "manual", "verified", "verified"]);
    expect(snapped.points[0]).toEqual({ x: 50, z: 52 });
    expect(snapped.points[1]).toEqual({ x: 200, z: 52 });
    expect(snapped.points[4]).toEqual({ x: 50, z: 150 });
    // The angled edge keeps its direction; its ends slide onto the snapped right and bottom walls.
    expect(snapped.points[2].x).toBe(200);
    expect(snapped.points[3].z).toBe(150);
    const slope = (first: { x: number; z: number }, second: { x: number; z: number }) => (second.z - first.z) / (second.x - first.x);
    expect(slope(snapped.points[2], snapped.points[3])).toBeCloseTo(slope(drawn.points[2], drawn.points[3]), 9);
  });

  it("finds the face nearest a tap within reach", () => {
    const plan: TracePlan = { rooms: [boxRoom("room-1", "living", { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges("verified", 20))], openPairs: [], doors: [], windows: [] };
    expect(nearestFace(plan, { x: 120, z: 45 })).toMatchObject({ index: 0, edge: { side: "top" }, point: { x: 120, z: 50 }, distance: 5 });
    expect(nearestFace(plan, { x: 120, z: 100 })).toBeNull();
  });

  it("measures the door gap nearest a tap: centre, clear width and swing into the room", () => {
    const plan: TracePlan = { rooms: [boxRoom("room-1", "living", { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges("verified", 20))], openPairs: [], doors: [], windows: [] };
    const door = traceOpening(context(), plan, { x: 120, z: 48 });
    expect(door).toMatchObject({ kind: "door", at: { x: 145, z: 50 }, roomId: "room-1", swingInto: "room-1" });
    expect(Math.abs(door!.width - 90)).toBeLessThanOrEqual(1);
  });

  it("finds every drawn opening along the traced faces once", () => {
    const plan: TracePlan = { rooms: [boxRoom("room-1", "living", { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges("verified", 20))], openPairs: [], doors: [], windows: [] };
    const found = scanOpenings(context(), plan);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "door", at: { x: 145, z: 50 }, swings: true, swingInto: "room-1" });
    const unchecked = { ...plan, rooms: [boxRoom("room-1", "living", { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges("unverified"))] };
    expect(scanOpenings(context(), unchecked)).toEqual([]);
  });
});
