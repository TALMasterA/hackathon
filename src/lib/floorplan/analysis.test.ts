import { describe, expect, it } from "vitest";
import { maskRects, type GrayImage } from "./image";
import { measureOpening } from "./openings";
import { dominantAngle } from "./orientation";
import { scaleFromTaps, snapTick } from "./scale";
import { edgeProbe, snapEdge, snapRooms, type SnapContext } from "./snap";
import { strokeWidths, type Strokes } from "./strokes";
import { blankPlan, drawDoorSwing, drawSegment, drawWall, fillRect, hLine, vLine, type WallDrawing } from "./test-image";

/** Synthetic plans at 1 cm per pixel: 4 px wall strokes, 1 px fixture strokes. */
const STROKES: Strokes = { thin: 1, heavy: 4, pens: [1, 4], distinct: true };
const context = (image: GrayImage): SnapContext => ({ image, cmPerPx: 1, strokes: STROKES });
const wall = (overrides: Partial<WallDrawing> & Pick<WallDrawing, "orientation" | "centre">): WallDrawing => ({ from: 60, to: 440, thickness: 20, line: 4, ...overrides });

/** One room with inner faces x 100–400, y 100–300, inside 20 cm walls (face strokes at 80/100, 300/320, ...). */
function roomPlan(top: Partial<WallDrawing> = {}): GrayImage {
  const image = blankPlan(520, 420);
  drawWall(image, wall({ orientation: "h", centre: 90, ...top }));
  drawWall(image, wall({ orientation: "h", centre: 310 }));
  drawWall(image, wall({ orientation: "v", centre: 90, from: 60, to: 340 }));
  drawWall(image, wall({ orientation: "v", centre: 410, from: 60, to: 340 }));
  return image;
}

const ROOM = { minX: 100, maxX: 400, minZ: 100, maxZ: 300 };
const topProbe = (position: number) => ({ ...edgeProbe(ROOM, "top"), position });

describe("pen widths", () => {
  it("finds a thin and a heavy pen", () => {
    const image = blankPlan(300, 300);
    for (let index = 0; index < 6; index++) {
      hLine(image, 20 + index * 20, 10, 290, 2);
      vLine(image, 160 + index * 20, 10, 290, 8);
    }
    const strokes = strokeWidths(image, 15);
    expect(strokes.thin).toBeCloseTo(2, 0);
    expect(strokes.heavy).toBeCloseTo(8, 0);
    expect(strokes.distinct).toBe(true);
  });

  it("reports one pen when every stroke is the same width", () => {
    const image = blankPlan(200, 200);
    for (let index = 0; index < 5; index++) hLine(image, 20 + index * 30, 10, 190, 3);
    expect(strokeWidths(image, 15)).toMatchObject({ distinct: false });
  });
});

describe("scale bar", () => {
  it("snaps a tap to the sub-pixel centre of the nearest tick, ignoring the bar itself", () => {
    const image = blankPlan(200, 100);
    hLine(image, 50, 40, 190, 2);
    vLine(image, 100.5, 40, 60, 2);
    vLine(image, 112.5, 40, 60, 2);
    expect(snapTick(image, { x: 104, y: 50 }, 12)?.x).toBeCloseTo(100.5, 1);
    expect(snapTick(image, { x: 110, y: 50 }, 12)?.x).toBeCloseTo(112.5, 1);
  });

  it("finds nothing on blank paper", () => {
    expect(snapTick(blankPlan(100, 100), { x: 50, y: 50 }, 12)).toBeNull();
  });

  it("turns two taps 400 px apart over 8 m into 2 cm per pixel", () => {
    expect(scaleFromTaps({ x: 100, y: 30 }, { x: 500, y: 30 }, 800)).toBe(2);
    expect(scaleFromTaps({ x: 1, y: 1 }, { x: 1, y: 1 }, 800)).toBeNull();
  });
});

describe("drawing orientation", () => {
  it("reads an axis-aligned plan as 0°", () => {
    expect(Math.abs(dominantAngle(roomPlan()))).toBeLessThan(0.3);
  });

  it("reads a wing drawn on the diagonal as 45°", () => {
    const image = blankPlan(300, 300);
    const corners = [[150, 30], [270, 150], [150, 270], [30, 150]];
    corners.forEach(([x, y], index) => drawSegment(image, x, y, corners[(index + 1) % 4][0], corners[(index + 1) % 4][1], 4));
    expect(Math.abs(Math.abs(dominantAngle(image)) - 45)).toBeLessThan(0.5);
  });

  it("measures a slightly skewed scan", () => {
    const image = blankPlan(400, 300);
    const slope = Math.tan(1.5 * Math.PI / 180);
    for (const y of [50, 120, 190, 260]) drawSegment(image, 20, y, 380, y + 360 * slope, 4);
    expect(dominantAngle(image)).toBeCloseTo(1.5, 0);
  });
});

describe("snapping one room edge to the drawn wall", () => {
  it.each([-30, -20, -10, 0, 10, 20, 30])("lands on the inner face stroke from %i cm away", (offset) => {
    const snap = snapEdge(context(roomPlan()), topProbe(100 + offset));
    expect(snap.status).toBe("verified");
    expect(Math.abs(snap.face - 100)).toBeLessThanOrEqual(0.25);
    expect(snap.thickness).toBeCloseTo(20, 0);
  });

  it("finds a face stroke centred between pixels to a quarter pixel", () => {
    const snap = snapEdge(context(roomPlan({ centre: 90.3 })), topProbe(112));
    expect(snap.status).toBe("verified");
    expect(Math.abs(snap.face - 100.3)).toBeLessThanOrEqual(0.25);
  });

  it("finds the inner face from the room below too", () => {
    const snap = snapEdge(context(roomPlan()), { ...edgeProbe(ROOM, "bottom"), position: 285 });
    expect(snap).toMatchObject({ status: "verified" });
    expect(snap.face).toBeCloseTo(300, 0);
  });

  it("gives each room its own face of a shared wall", () => {
    // The wall with face strokes at 300 and 320 is shared with a room below it.
    const image = roomPlan();
    const below = { minX: 100, maxX: 400, minZ: 320, maxZ: 400 };
    const upper = snapEdge(context(image), { ...edgeProbe(ROOM, "bottom"), position: 310 });
    const lower = snapEdge(context(image), { ...edgeProbe(below, "top"), position: 310 });
    expect(upper.face).toBeCloseTo(300, 0);
    expect(lower.face).toBeCloseTo(320, 0);
  });

  it("still verifies a wall with a door across a quarter of it, or a window across 60 %", () => {
    const door = snapEdge(context(roomPlan({ gaps: [[200, 252]] })), topProbe(115));
    expect(door.status).toBe("verified");
    expect(door.face).toBeCloseTo(100, 0);
    const window = snapEdge(context(roomPlan({ gaps: [[180, 306]], glazing: [[180, 306]] })), topProbe(115));
    expect(window.status).toBe("verified");
    expect(window.face).toBeCloseTo(100, 0);
  });

  it("prefers the wall 25 cm out over a counter edge 20 cm in", () => {
    const image = roomPlan();
    hLine(image, 145, 110, 390, 1);
    const snap = snapEdge(context(image), topProbe(125));
    expect(snap.status).toBe("verified");
    expect(snap.face).toBeCloseTo(100, 0);
  });

  it("does not take a bath rim drawn as two thin strokes 5 cm apart for a wall", () => {
    const image = roomPlan();
    hLine(image, 120, 110, 390, 1);
    hLine(image, 125, 110, 390, 1);
    const snap = snapEdge(context(image), topProbe(122));
    expect(snap.status).toBe("verified");
    expect(snap.face).toBeCloseTo(100, 0);
  });

  it("ignores a text label once its box is masked", () => {
    const image = roomPlan();
    fillRect(image, 180, 104, 240, 140);
    const masked = maskRects(image, [{ x: 178, y: 103, width: 64, height: 39 }]);
    expect(snapEdge(context(masked), topProbe(115))).toEqual(snapEdge(context(roomPlan()), topProbe(115)));
  });

  it("keeps the given position, unverified, when no stroke is in reach", () => {
    expect(snapEdge(context(blankPlan(520, 420)), topProbe(115))).toMatchObject({ face: 115, status: "unverified", confidence: 0 });
  });

  it("refuses to choose between two equally good walls", () => {
    const image = blankPlan(520, 420);
    drawWall(image, wall({ orientation: "h", centre: 60 }));
    drawWall(image, wall({ orientation: "h", centre: 120 }));
    const snap = snapEdge(context(image), topProbe(100));
    expect(snap.status).toBe("unverified");
  });

  it("finds the face half a stroke inside a solid band of merged strokes", () => {
    const image = blankPlan(520, 420);
    fillRect(image, 60, 78, 440, 102);
    const snap = snapEdge(context(image), topProbe(115));
    expect(snap.face).toBeCloseTo(100, 0);
    expect(snap.thickness).toBeCloseTo(20, 0);
  });
});

describe("Housing Authority drawing conventions (0.5 cm per pixel, pens as in Harmony 1)", () => {
  // Thin 0.36 pt (fixtures, glazing), medium 0.72 pt (partitions), heavy 1.44 pt (structure), at 0.5 cm/px.
  const PENS: Strokes = { thin: 5, heavy: 20, pens: [5, 10, 20], distinct: true };
  const half = (image: GrayImage): SnapContext => ({ image, cmPerPx: 0.5, strokes: PENS });

  /** Inner faces x 200–800, y 200–600 px: a medium-pen partition above, merged glazing left, heavy walls right and below. */
  function plan(): GrayImage {
    const image = blankPlan(1000, 760);
    hLine(image, 185, 100, 900, 10);
    hLine(image, 200, 100, 900, 10);
    vLine(image, 160, 150, 650, 5);
    // Glazing strokes 3–4 px apart merge into one 16 px band, as Harmony 1's do (17 px), wider than a medium pen.
    for (const x of [189, 193, 197, 200]) vLine(image, x, 150, 650, 5);
    hLine(image, 600, 100, 900, 20);
    hLine(image, 650, 100, 900, 20);
    vLine(image, 800, 150, 700, 20);
    vLine(image, 850, 150, 700, 20);
    // Glazing in a small window gap beside the partition's outer stroke must not pull its centre.
    hLine(image, 175, 400, 470, 5);
    return image;
  }
  const box = { minX: 200, maxX: 800, minZ: 200, maxZ: 600 };

  it.each([
    ["top", "a partition drawn as two medium strokes 7.5 cm apart", 200, 7.5],
    ["left", "a window wall of merged glazing strokes, at the innermost one", 200, 20],
    ["bottom", "a structural wall of two heavy strokes", 600, 25],
    ["right", "a structural wall from inside the room", 800, 25],
  ] as const)("verifies the %s edge: %s", (side, _, face, thickness) => {
    const probe = edgeProbe(box, side);
    const snap = snapEdge(half(plan()), { ...probe, position: probe.position + probe.interior * 20 });
    expect(snap.status).toBe("verified");
    expect(Math.abs(snap.face - face)).toBeLessThanOrEqual(0.5);
    expect(snap.thickness).toBeCloseTo(thickness, 0);
  });

  it("measures the pens of such a drawing", () => {
    const strokes = strokeWidths(plan(), 30);
    expect(strokes.distinct).toBe(true);
    // Anti-aliasing turns a 5 px stroke into 4 or 5 px ink runs.
    expect(Math.abs(strokes.thin - 5)).toBeLessThanOrEqual(1.2);
    expect(Math.abs(strokes.heavy - 20)).toBeLessThanOrEqual(1.2);
  });
});

describe("snapping whole rooms", () => {
  it("snaps all four edges of a room from a rough box", () => {
    const [room] = snapRooms(context(roomPlan()), [{ id: "r1", box: { minX: 118, maxX: 385, minZ: 82, maxZ: 322 } }]);
    for (const [key, value] of Object.entries(ROOM)) expect(room.box[key as keyof typeof ROOM]).toBeCloseTo(value, 0);
    expect(Object.values(room.edges).every((edge) => edge.status === "verified")).toBe(true);
  });

  it("places an edge hidden behind a door opening from the neighbour's verified wall", () => {
    const image = blankPlan(520, 420);
    drawWall(image, wall({ orientation: "h", centre: 90 }));
    drawWall(image, wall({ orientation: "h", centre: 310, gaps: [[205, 275]] }));
    drawWall(image, wall({ orientation: "v", centre: 90, from: 60, to: 340 }));
    drawWall(image, wall({ orientation: "v", centre: 410, from: 60, to: 340 }));
    const small = { minX: 200, maxX: 280, minZ: 312, maxZ: 400 };
    expect(snapEdge(context(image), edgeProbe(small, "top")).status).toBe("unverified");
    const [, below] = snapRooms(context(image), [{ id: "a", box: ROOM }, { id: "b", box: small }]);
    expect(below.edges.top.status).toBe("verified");
    expect(below.box.minZ).toBeCloseTo(320, 0);
  });

  it("gives rooms joined as an open pair one shared face with no wall", () => {
    const image = blankPlan(520, 420);
    drawWall(image, wall({ orientation: "h", centre: 90 }));
    const rooms = snapRooms(context(image), [{ id: "a", box: { minX: 100, maxX: 250, minZ: 100, maxZ: 300 } }, { id: "b", box: { minX: 256, maxX: 400, minZ: 100, maxZ: 300 } }], [["a", "b"]]);
    expect(rooms[0].box.maxX).toBeCloseTo(253, 6);
    expect(rooms[1].box.minX).toBeCloseTo(253, 6);
    expect([rooms[0].edges.right.status, rooms[1].edges.left.status]).toEqual(["open", "open"]);
  });
});

describe("wall openings", () => {
  const top = { orientation: "h" as const, face: 100, farFace: 80, interior: 1 as const };

  it("measures a door's clear width and sees it swing into the room", () => {
    const image = roomPlan({ gaps: [[200, 280]] });
    drawDoorSwing(image, "h", 102, 200, 280, 1, 1);
    const door = measureOpening(context(image), top, 235);
    expect(door?.kind).toBe("door");
    expect(Math.abs(door!.width - 80)).toBeLessThanOrEqual(1);
    expect(door!.centre).toBeCloseTo(240, 0);
    expect(door!.swing).toBe(1);
  });

  it("sees a door that swings away from the room", () => {
    const image = roomPlan({ gaps: [[200, 280]] });
    drawDoorSwing(image, "h", 78, 200, 280, -1, 1);
    expect(measureOpening(context(image), top, 240)?.swing).toBe(-1);
  });

  it("tells a window from a door by its glazing", () => {
    const window = measureOpening(context(roomPlan({ gaps: [[150, 270]], glazing: [[150, 270]] })), top, 200);
    expect(window?.kind).toBe("window");
    expect(Math.abs(window!.width - 120)).toBeLessThanOrEqual(1);
  });

  it("finds nothing when the wall has no opening near the point", () => {
    expect(measureOpening(context(roomPlan()), top, 240)).toBeNull();
  });
});
