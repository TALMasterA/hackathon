import { describe, expect, it } from "vitest";
import { boxRoom, roomEdge } from "@/lib/floorplan/trace";
import { closeShape, edgeNear, openingSpan, snapCorner } from "./draw";

describe("drawing a room by its corners", () => {
  it("turns a nearly straight line onto the nearest 45° step, unless Alt is held", () => {
    expect(snapCorner({ point: { x: 300, z: 12 }, unit: 1, previous: { x: 0, z: 0 } })).toEqual({ point: { x: 300, z: 0 }, snap: "angle" });
    const diagonal = snapCorner({ point: { x: 200, z: 190 }, unit: 1, previous: { x: 0, z: 0 } });
    expect(diagonal.snap).toBe("angle");
    expect(diagonal.point.x).toBeCloseTo(diagonal.point.z, 9);
    expect(snapCorner({ point: { x: 300, z: 12 }, unit: 1, previous: { x: 0, z: 0 }, free: true })).toEqual({ point: { x: 300, z: 12 }, snap: "free" });
    // 20° off any step stays where it was tapped.
    expect(snapCorner({ point: { x: 300, z: 109 }, unit: 1, previous: { x: 0, z: 0 } }).snap).toBe("free");
  });

  it("lines a straight line's end up with the first corner, and closes the room at it", () => {
    const first = { x: 0, z: 0 };
    expect(snapCorner({ point: { x: 4, z: 405 }, unit: 1, previous: { x: 300, z: 400 }, first }).point).toEqual({ x: 0, z: 400 });
    expect(snapCorner({ point: { x: 6, z: -5 }, unit: 1, previous: { x: 0, z: 400 }, first })).toEqual({ point: first, snap: "close" });
    // At half the zoom the same screen distance is twice as many centimetres.
    expect(snapCorner({ point: { x: 20, z: 10 }, unit: 2, previous: { x: 0, z: 400 }, first }).snap).toBe("close");
  });

  it("closes a shape clockwise, dropping straight-through corners, and refuses crossing or tiny ones", () => {
    const result = closeShape([{ x: 0, z: 0 }, { x: 0, z: 300 }, { x: 400, z: 300 }, { x: 400, z: 150 }, { x: 400, z: 0 }]);
    expect(result).toEqual({ room: { kind: "other", points: [{ x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }, { x: 0, z: 0 }], edges: Array.from({ length: 4 }, () => ({ status: "manual" })) } });
    expect(closeShape([{ x: 0, z: 0 }, { x: 300, z: 300 }, { x: 300, z: 0 }, { x: 0, z: 300 }])).toEqual({ problem: "crossing" });
    expect(closeShape([{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 300 }, { x: 0, z: 300 }])).toEqual({ problem: "small" });
  });
});

describe("dragging an opening along a wall", () => {
  const room = boxRoom("r", "living", { minX: 0, maxX: 400, minZ: 0, maxZ: 300 });

  it("spans the drag on the edge, hinged where the drag began", () => {
    // Edge 0 is the top edge, running left to right.
    const top = roomEdge(room, 0);
    expect(openingSpan(top, 100, 190)).toMatchObject({ at: { x: 145, z: 0 }, width: 90, hinge: "low" });
    expect(openingSpan(top, 190, 100)).toMatchObject({ at: { x: 145, z: 0 }, width: 90, hinge: "high" });
    // Edge 2 is the bottom edge, running right to left: dragging from its start still hinges at the right.
    const bottom = roomEdge(room, 2);
    expect(openingSpan(bottom, 0, 80)).toMatchObject({ at: { x: 360, z: 300 }, width: 80, hinge: "high" });
    // A drag past the corner stops at it.
    expect(openingSpan(top, 350, 480).width).toBe(50);
  });

  it("finds the edge of a room nearest a point", () => {
    expect(edgeNear(room, { x: 200, z: 296 }, 10)).toMatchObject({ edge: { index: 2 }, point: { x: 200, z: 300 }, distance: 4 });
    expect(edgeNear(room, { x: 200, z: 150 }, 10)).toBeNull();
  });
});
