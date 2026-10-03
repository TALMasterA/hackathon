import { describe, expect, it } from "vitest";
import type { SnapContext } from "./snap";
import { blankPlan, drawDoorSwing, drawWall, type WallDrawing } from "./test-image";
import { edges, type TracePlan } from "./trace";
import { nearestFace, scanOpenings, snapTraceEdge, snapTraceRooms, traceOpening } from "./trace-snap";

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
    expect(room.box).toMatchObject({ minX: 50, maxX: 200, maxZ: 150 });
    expect(room.edges.bottom).toEqual({ status: "verified", thickness: 20 });
    // The door takes three quarters of the top wall, so that edge is left where it was, for the user to check.
    expect(room.edges.top.status).toBe("unverified");
    expect(room.box.minZ).toBe(41);
  });

  it("puts a dragged edge on the drawn wall, or leaves it where the user put it", () => {
    const room = { id: "room-1", kind: "living" as const, box: { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges: edges("verified", 20) };
    expect(snapTraceEdge(context(), room, "right", 193)).toEqual({ box: { ...room.box, maxX: 200 }, edge: { status: "verified", thickness: 20 } });
    expect(snapTraceEdge(context(), room, "right", 140.3)).toEqual({ box: { ...room.box, maxX: 140.5 }, edge: { status: "manual" } });
  });

  it("finds the face nearest a tap within reach", () => {
    const plan: TracePlan = { rooms: [{ id: "room-1", kind: "living", box: { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges: edges("verified", 20) }], openPairs: [], doors: [], windows: [] };
    expect(nearestFace(plan, { x: 120, z: 45 })).toMatchObject({ side: "top", distance: 5 });
    expect(nearestFace(plan, { x: 120, z: 100 })).toBeNull();
  });

  it("measures the door gap nearest a tap: centre, clear width and swing into the room", () => {
    const plan: TracePlan = { rooms: [{ id: "room-1", kind: "living", box: { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges: edges("verified", 20) }], openPairs: [], doors: [], windows: [] };
    const door = traceOpening(context(), plan, { x: 120, z: 48 });
    expect(door).toMatchObject({ kind: "door", at: { x: 145, z: 50 }, roomId: "room-1", swingInto: "room-1" });
    expect(Math.abs(door!.width - 90)).toBeLessThanOrEqual(1);
  });

  it("finds every drawn opening along the traced faces once", () => {
    const plan: TracePlan = { rooms: [{ id: "room-1", kind: "living", box: { minX: 50, maxX: 200, minZ: 50, maxZ: 150 }, edges: edges("verified", 20) }], openPairs: [], doors: [], windows: [] };
    const found = scanOpenings(context(), plan);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "door", at: { x: 145, z: 50 }, swings: true, swingInto: "room-1" });
    const unchecked = { ...plan, rooms: [{ ...plan.rooms[0], edges: edges("unverified") }] };
    expect(scanOpenings(context(), unchecked)).toEqual([]);
  });
});
