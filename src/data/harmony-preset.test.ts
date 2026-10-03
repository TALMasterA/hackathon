import { describe, expect, it } from "vitest";
import { HARMONY_EXAMPLES, HARMONY_FLAT } from "./harmony-preset";
import { containingRoom, doorGeometry, openingEndpoints, wallDirection, wallPanels, wallParts } from "../lib/geometry/architecture";
import { analyzeLayout } from "../lib/geometry/layout";
import { polygonArea, rectanglePolygon, scenePositionCm, threeRotation } from "../lib/geometry/oriented";
import { placeLibraryItem, suggestFurniture } from "../features/flat-editor/layout";
import { FURNITURE_LIBRARY, SUGGESTED_FURNITURE } from "./flat-preset";

describe("Harmony single-flat reference", () => {
  it("keeps the isolated centimetre outline and approximate envelope-area caveat", () => {
    expect(HARMONY_FLAT.width).toBeCloseTo(1011.43);
    expect(HARMONY_FLAT.depth).toBe(760);
    expect(polygonArea(HARMONY_FLAT.outline!) / 10000).toBeCloseTo(60.65, 1);
    expect(HARMONY_FLAT.source?.windowStatus).toBe("partial-trace");
    expect(HARMONY_FLAT.rooms.every((room) => room.name.en.includes("approx."))).toBe(true);
    expect(SUGGESTED_FURNITURE).toHaveLength(20);
  });

  it("validates every prepared example without moving existing furniture", () => {
    expect(analyzeLayout(HARMONY_FLAT, HARMONY_EXAMPLES, 260)).toEqual([]);
    for (const item of HARMONY_EXAMPLES) expect(containingRoom(HARMONY_FLAT, item.position)?.id).toBe(item.roomId);
    const result = suggestFurniture(HARMONY_FLAT, [], { position: [], distance: [] }, "all");
    expect(result.added).toHaveLength(HARMONY_EXAMPLES.length);
    expect(result.skipped).toEqual([]);
    for (const room of HARMONY_FLAT.rooms) expect(suggestFurniture(HARMONY_FLAT, [], { position: [], distance: [] }, room.id).added.length).toBeGreaterThan(0);
  });

  it("places a library sofa inside the central polygon and flags the exterior notch", () => {
    const sofa = placeLibraryItem(HARMONY_FLAT, [], FURNITURE_LIBRARY[0], "central", "item-1");
    expect(sofa).not.toBeNull();
    expect(analyzeLayout(HARMONY_FLAT, [sofa!], 260)).toEqual([]);
    expect(analyzeLayout(HARMONY_FLAT, [{ ...sofa!, position: { x: 60, z: 200 } }], 260)).toContainEqual(expect.objectContaining({ code: "envelope", side: "outline" }));
  });

  it("keeps openings within host segments and explicit entrance hinge/swing", () => {
    for (const opening of [...HARMONY_FLAT.doors, ...HARMONY_FLAT.windows]) {
      const host = HARMONY_FLAT.walls.find((wall) => wall.id === opening.wallId)!;
      const direction = wallDirection(host);
      const endpoints = openingEndpoints(opening, host);
      const length = Math.hypot(host.end.x - host.start.x, host.end.z - host.start.z);
      for (const point of [endpoints.start, endpoints.end]) {
        const offset = (point.x - host.start.x) * direction.x + (point.z - host.start.z) * direction.z;
        expect(offset).toBeGreaterThanOrEqual(-0.01);
        expect(offset).toBeLessThanOrEqual(length + 0.01);
      }
    }
    const geometry = doorGeometry(HARMONY_FLAT.doors[0], HARMONY_FLAT);
    expect(geometry.hinge.x).toBeCloseTo(412.29);
    expect(geometry.closedEnd.x).toBeCloseTo(322.29);
    expect(geometry.openEnd.x).toBeCloseTo(412.29);
    expect(geometry.hinge.z).toBe(730);
    expect(geometry.openEnd.z).toBe(640);
    expect(geometry.sweep).toBe(1);
  });

  it("has real door headers/window sill panels, but retains below-sill wall collision", () => {
    const panels = wallPanels(HARMONY_FLAT);
    expect(panels.filter((panel) => panel.wallId === "top-central").map((panel) => [panel.bottom, panel.height])).toEqual([[0, 90], [210, 50]]);
    expect(panels.some((panel) => panel.wallId === "south-wall" && panel.bottom === 205)).toBe(true);
    expect(wallParts(HARMONY_FLAT).some((part) => part.wallId === "top-central")).toBe(true);
    const oblique = panels.find((panel) => panel.wallId === "bay-window-host")!;
    expect(oblique.orientation).toBeCloseTo(45);
    expect(rectanglePolygon(oblique)).toHaveLength(4);
  });

  it("maps furniture to the same centred metre coordinates at 0 and 90 degrees", () => {
    expect(scenePositionCm({ x: HARMONY_FLAT.width / 2, z: 380 }, HARMONY_FLAT)).toEqual([0, 0, 0]);
    expect(threeRotation(0)).toBe(-0);
    expect(threeRotation(90)).toBe(-Math.PI / 2);
  });
});