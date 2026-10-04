import { describe, expect, it } from "vitest";
import { DEMO_FLAT, SUGGESTED_FURNITURE } from "../../data/flat-preset";
import { containingRoom, doorGeometry, wallAxis, wallParts } from "./architecture";
import { analyzeLayout } from "./layout";
import { floorTrianglePositions, pointInPolygon, polygonArea, polygonOutsideArea, polygonOverlap, rectanglePolygon } from "./oriented";

const item = SUGGESTED_FURNITURE[3];

describe("concave floor geometry", () => {
  const outline = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 60, z: 100 }, { x: 60, z: 40 }, { x: 40, z: 40 }, { x: 40, z: 100 }, { x: 0, z: 100 }];

  it("rejects an edge crossing a notch even when all furniture corners are inside", () => {
    const footprint = rectanglePolygon({ width: 60, depth: 20, position: { x: 50, z: 70 }, orientation: 0 });
    expect(footprint.every((point) => pointInPolygon(point, outline))).toBe(true);
    expect(polygonOutsideArea(footprint, outline)).toBeCloseTo(400);
    expect(polygonOutsideArea(rectanglePolygon({ width: 20, depth: 20, position: { x: 20, z: 70 }, orientation: 30 }), outline)).toBeCloseTo(0);
  });

  it("triangulates only the actual floor area with upward-facing triangles", () => {
    const positions = floorTrianglePositions(outline, { width: 100, depth: 100 });
    let area = 0;
    for (let offset = 0; offset < positions.length; offset += 9) {
      const cross = (positions[offset + 6] - positions[offset]) * (positions[offset + 5] - positions[offset + 2]) - (positions[offset + 3] - positions[offset]) * (positions[offset + 8] - positions[offset + 2]);
      expect(cross).toBeGreaterThan(0);
      area += cross / 2;
    }
    expect(area * 10000).toBeCloseTo(polygonArea(outline), 2);
  });
});

describe("whole-flat data sanity", () => {
  it("has exactly five rooms and no corridor", () => {
    expect(DEMO_FLAT.rooms.map((room) => room.id)).toEqual(["living", "kitchen", "bathroom", "master", "second"]);
    expect(DEMO_FLAT.dimensionSource).toBe("team-demo-assumptions");
  });

  it("has no overlapping rooms and every room stays within the envelope", () => {
    for (let index = 0; index < DEMO_FLAT.rooms.length; index++) {
      const room = DEMO_FLAT.rooms[index];
      const polygon = rectanglePolygon(room);
      expect(polygon.every((point) => point.x >= 0 && point.x <= DEMO_FLAT.width && point.z >= 0 && point.z <= DEMO_FLAT.depth)).toBe(true);
      for (const other of DEMO_FLAT.rooms.slice(index + 1)) expect(polygonOverlap(polygon, rectanglePolygon(other))).toBeNull();
    }
  });

  it("uses consistent axis-aligned wall thickness", () => {
    for (const wall of DEMO_FLAT.walls) {
      expect(wall.thickness).toBe(10);
      expect(wall.start.x === wall.end.x || wall.start.z === wall.end.z).toBe(true);
    }
  });

  it("puts every door and window on a known wall with an opening inside its length", () => {
    for (const opening of [...DEMO_FLAT.doors, ...DEMO_FLAT.windows]) {
      const wall = DEMO_FLAT.walls.find((entry) => entry.id === opening.wallId);
      expect(wall).toBeDefined();
      if (!wall) continue;
      const axis = wallAxis(wall);
      const fixed = axis === "x" ? "z" : "x";
      expect(opening.position[fixed]).toBe(wall.start[fixed]);
      expect(opening.position[axis] - opening.width / 2).toBeGreaterThanOrEqual(wall.start[axis]);
      expect(opening.position[axis] + opening.width / 2).toBeLessThanOrEqual(wall.end[axis]);
    }
  });

  it("connects all rooms directly to living and has an entrance door", () => {
    expect(DEMO_FLAT.doors.find((door) => door.id === "front-door")?.connects).toContain("outside");
    for (const room of DEMO_FLAT.rooms.filter((entry) => entry.id !== "living")) {
      expect(DEMO_FLAT.doors.some((door) => door.connects.includes(room.id) && door.connects.includes("living"))).toBe(true);
    }
  });

  it("has correct usable room area and valid suggested item-room membership", () => {
    expect(DEMO_FLAT.rooms.reduce((sum, room) => sum + polygonArea(rectanglePolygon(room)), 0)).toBe(382100);
    expect(SUGGESTED_FURNITURE).toHaveLength(20);
    expect(new Set(SUGGESTED_FURNITURE.map((entry) => entry.id)).size).toBe(20);
    for (const entry of SUGGESTED_FURNITURE) expect(containingRoom(DEMO_FLAT, entry.position)?.id).toBe(entry.roomId);
  });

  it("keeps the suggested set free of any collision, door, envelope, or height warning", () => {
    expect(analyzeLayout(DEMO_FLAT, SUGGESTED_FURNITURE, 260)).toEqual([]);
  });

  it("turns suggested items only where the footprint is unchanged, so the sofa and TV console face each other", () => {
    for (const entry of SUGGESTED_FURNITURE.filter((suggestion) => suggestion.orientation !== 0)) {
      const corners = (polygon: { x: number; z: number }[]) => polygon.map((point) => `${point.x.toFixed(6)},${point.z.toFixed(6)}`).sort();
      expect(corners(rectanglePolygon(entry)), entry.id).toEqual(corners(rectanglePolygon({ ...entry, orientation: 0 })));
    }
    const front = (angle: number) => ({ x: Math.sin(angle * Math.PI / 180), z: -Math.cos(angle * Math.PI / 180) });
    const sofa = SUGGESTED_FURNITURE.find((entry) => entry.id === "living-sofa")!;
    const tv = SUGGESTED_FURNITURE.find((entry) => entry.id === "living-tv")!;
    const toward = (from: typeof sofa, to: typeof sofa) => (to.position.x - from.position.x) * front(from.orientation).x + (to.position.z - from.position.z) * front(from.orientation).z;
    expect(toward(sofa, tv)).toBeGreaterThan(0);
    expect(toward(tv, sofa)).toBeGreaterThan(0);
  });
});

describe("live whole-flat warnings", () => {
  it("reports exact oblique furniture overlap", () => {
    const overlap = { ...item, id: "rotated", orientation: 30, position: { ...item.position } };
    const issues = analyzeLayout(DEMO_FLAT, [item, overlap], 260);
    expect(issues).toContainEqual(expect.objectContaining({ code: "furniture", itemId: item.id, obstacleId: "rotated" }));
  });

  it("detects a solid wall rather than treating the whole flat as empty", () => {
    expect(analyzeLayout(DEMO_FLAT, [{ ...item, position: { x: 425, z: 180 } }], 260)).toContainEqual(expect.objectContaining({ code: "wall", obstacleId: "service-wall" }));
  });

  it("leaves a door opening as a real gap in wall rectangles", () => {
    const openingItem = { ...item, width: 20, depth: 8, position: { x: 365, z: 5 } };
    expect(analyzeLayout(DEMO_FLAT, [openingItem], 260)).toEqual([]);
    expect(wallParts(DEMO_FLAT).filter((part) => part.wallId === "front-wall")).toHaveLength(2);
  });

  it("reports the front-door swing separately from solid walls", () => {
    const door = DEMO_FLAT.doors[0];
    const zone = doorGeometry(door, DEMO_FLAT).zone;
    const issues = analyzeLayout(DEMO_FLAT, [{ ...item, position: zone.position }], 260);
    expect(issues).toContainEqual(expect.objectContaining({ code: "door", obstacleId: "front-door", penetration: 60 }));
  });

  it("reports outside-envelope overflow and an actual highlight polygon", () => {
    const issues = analyzeLayout(DEMO_FLAT, [{ ...item, position: { x: -5, z: 100 } }], 260);
    const outside = issues.find((issue) => issue.code === "envelope");
    expect(outside).toMatchObject({ side: "left", excess: 25 });
    if (outside?.code === "envelope") expect(polygonArea(outside.polygon)).toBeCloseTo(1000);
  });

  it("changes ceiling-height warnings without changing footprint geometry", () => {
    const tall = { ...item, height: 250 };
    expect(analyzeLayout(DEMO_FLAT, [tall], 260)).toEqual([]);
    expect(analyzeLayout(DEMO_FLAT, [tall], 220)).toContainEqual({ code: "height", id: `height-${item.id}`, itemId: item.id, excess: 30 });
  });

  it("does not turn a visual window into a floor-clearance obstacle", () => {
    const touching = { ...item, position: { x: 210, z: 30 } };
    expect(analyzeLayout(DEMO_FLAT, [touching], 260)).toEqual([]);
  });

  it("returns all applicable warning categories for one edit", () => {
    const huge = { ...item, width: 1000, depth: 1000, height: 300, position: { x: 250, z: 250 } };
    const issues = analyzeLayout(DEMO_FLAT, [huge, SUGGESTED_FURNITURE[0]], 260);
    expect(new Set(issues.map((issue) => issue.code))).toEqual(new Set(["furniture", "wall", "door", "envelope", "height"]));
  });
});
describe("single-item checks", () => {
  it("itemViolations equals analyzeLayout filtered to the item, in order and value", async () => {
    const { itemViolations, issueItemIds } = await import("./layout");
    const { HARMONY_EXAMPLES, HARMONY_FLAT } = await import("../../data/harmony-preset");
    const crowded = SUGGESTED_FURNITURE.map((entry) => entry.id === "living-side-table" ? { ...entry, position: { x: 330, z: 300 } } : entry.id === "living-coffee-table" ? { ...entry, position: { x: 365, z: 60 }, orientation: 30 } : entry);
    for (const [flat, furniture] of [[DEMO_FLAT, crowded], [DEMO_FLAT, SUGGESTED_FURNITURE], [HARMONY_FLAT, HARMONY_EXAMPLES]] as const) {
      const all = analyzeLayout(flat, furniture, 260);
      for (const entry of furniture) expect(itemViolations(flat, furniture, entry.id, 260)).toEqual(all.filter((issue) => issueItemIds(issue).includes(entry.id)));
    }
    expect(analyzeLayout(DEMO_FLAT, crowded, 260).length).toBeGreaterThan(0);
    expect(itemViolations(DEMO_FLAT, crowded, "missing", 260)).toEqual([]);
  });
});
