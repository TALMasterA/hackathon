import { describe, expect, it } from "vitest";
import { GEOMETRY_EPSILON_CM } from "./footprint";
import { clipPolygon, normalizeAngle, polygonArea, polygonDistance, polygonOverlap, rectanglePolygon, scenePositionCm, threeRotation } from "./oriented";

const rectangle = (x = 0, z = 0, orientation = 0, width = 10, depth = 10) => rectanglePolygon({ position: { x, z }, width, depth, orientation });

describe("oriented rectangle geometry", () => {
  it.each([0, 30, 45, 90, 135, 360])("detects a rotated overlap at %s degrees", (angle) => {
    expect(polygonOverlap(rectangle(), rectangle(3, 0, angle))).not.toBeNull();
    expect(polygonOverlap(rectangle(), rectangle(30, 0, angle))).toBeNull();
  });

  it.each([[10, 0], [10, 10]])("allows exact edge or corner touching at %s/%s", (x, z) => {
    expect(polygonOverlap(rectangle(), rectangle(x, z))).toBeNull();
    expect(polygonDistance(rectangle(), rectangle(x, z))).toBe(0);
  });

  it("allows rotated corner contact", () => {
    expect(polygonOverlap(rectangle(), rectangle(5 + Math.sqrt(50), 0, 45))).toBeNull();
  });

  it("ignores epsilon noise but detects meaningful penetration", () => {
    expect(polygonOverlap(rectangle(), rectangle(10 - GEOMETRY_EPSILON_CM / 2))).toBeNull();
    expect(polygonOverlap(rectangle(), rectangle(10 - GEOMETRY_EPSILON_CM * 4))).not.toBeNull();
  });

  it("returns correct penetration, extent, area and separating translation", () => {
    const result = polygonOverlap(rectangle(), rectangle(8));
    expect(result).toMatchObject({ penetration: 2, overlapX: 2, overlapZ: 10, area: 20 });
    expect(result?.translation).toEqual({ x: -2, z: 0 });
    expect(polygonOverlap(rectangle(-2), rectangle(8))).toBeNull();
  });

  it("accounts for containment when computing minimum translation", () => {
    const result = polygonOverlap(rectangle(), rectangle(0, 0, 0, 2, 2));
    expect(result?.penetration).toBe(6);
    expect(result?.area).toBe(4);
  });

  it("clips a 45-degree square to a known octagon", () => {
    const polygon = clipPolygon(rectangle(), rectangle(0, 0, 45));
    expect(polygon).toHaveLength(8);
    expect(polygonArea(polygon)).toBeCloseTo(200 * (Math.SQRT2 - 1), 8);
  });

  it("computes exact separated polygon distance", () => {
    expect(polygonDistance(rectangle(), rectangle(13, 14))).toBeCloseTo(5, 10);
    expect(polygonDistance(rectangle(), rectangle(8))).toBe(0);
  });

  it("computes exact distance to a rotated footprint", () => {
    expect(polygonDistance(rectangle(), rectangle(20, 0, 45))).toBeCloseTo(15 - Math.sqrt(50), 10);
  });

  it("is symmetric for overlap area and distance", () => {
    const first = rectangle(2, 1, 30, 14, 8);
    const second = rectangle(5, 3, 135, 12, 6);
    expect(polygonOverlap(first, second)?.area).toBeCloseTo(polygonOverlap(second, first)?.area ?? -1, 8);
    expect(polygonDistance(first, rectangle(30))).toBeCloseTo(polygonDistance(rectangle(30), first), 10);
  });

  it("normalises angles without rounding", () => {
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-30)).toBe(330);
    expect(normalizeAngle(30.25)).toBe(30.25);
    expect(() => normalizeAngle(Infinity)).toThrow();
  });

  it("uses the same clockwise sign in the plan and Three.js", () => {
    const angle = threeRotation(90);
    const local = { x: 5, z: -2 };
    const fromThree = { x: local.x * Math.cos(angle) + local.z * Math.sin(angle), z: -local.x * Math.sin(angle) + local.z * Math.cos(angle) };
    const corner = rectanglePolygon({ width: 10, depth: 4, position: { x: 0, z: 0 }, orientation: 90 })[1];
    expect(fromThree.x).toBeCloseTo(corner.x, 10);
    expect(fromThree.z).toBeCloseTo(corner.z, 10);
    expect(scenePositionCm({ x: 430, z: 420 }, { width: 660, depth: 640 })).toEqual([1, 0, 1]);
  });
});