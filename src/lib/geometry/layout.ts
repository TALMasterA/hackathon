import type { BoundarySide, Flat, FlatFurniture, LayoutViolation, Position2D } from "../../types/domain";
import { doorGeometry, wallParts } from "./architecture";
import { GEOMETRY_EPSILON_CM } from "./footprint";
import { clipPolygon, polygonBounds, polygonOverlap, rectanglePolygon } from "./oriented";

export function analyzeLayout(flat: Flat, furniture: readonly FlatFurniture[], ceilingHeight: number): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const polygons = furniture.map(rectanglePolygon);
  const walls = wallParts(flat).map((part) => ({ ...part, polygon: rectanglePolygon(part) }));
  const doors = flat.doors.map((door) => ({ id: door.id, polygon: rectanglePolygon(doorGeometry(door, flat).zone) }));

  for (let index = 0; index < furniture.length; index++) {
    const item = furniture[index];
    const polygon = polygons[index];
    const bounds = polygonBounds(polygon);
    const sides: [BoundarySide, number][] = [["left", -bounds.minX], ["right", bounds.maxX - flat.width], ["front", -bounds.minZ], ["back", bounds.maxZ - flat.depth]];
    for (const [side, excess] of sides) {
      if (excess <= GEOMETRY_EPSILON_CM) continue;
      const region = outsideRegion(side, bounds, flat);
      violations.push({ code: "envelope", id: `envelope-${item.id}-${side}`, itemId: item.id, side, excess, polygon: clipPolygon(polygon, region) });
    }
    if (item.height > ceilingHeight) violations.push({ code: "height", id: `height-${item.id}`, itemId: item.id, excess: item.height - ceilingHeight });

    for (let other = index + 1; other < furniture.length; other++) {
      const overlap = polygonOverlap(polygon, polygons[other]);
      if (overlap) violations.push({ code: "furniture", id: `furniture-${item.id}-${furniture[other].id}`, itemId: item.id, obstacleId: furniture[other].id, ...overlap });
    }
    for (const wall of walls) {
      const overlap = polygonOverlap(polygon, wall.polygon);
      if (overlap) violations.push({ code: "wall", id: `wall-${item.id}-${wall.id}`, itemId: item.id, obstacleId: wall.wallId, ...overlap });
    }
    for (const door of doors) {
      const overlap = polygonOverlap(polygon, door.polygon);
      if (overlap) violations.push({ code: "door", id: `door-${item.id}-${door.id}`, itemId: item.id, obstacleId: door.id, ...overlap });
    }
  }
  return violations;
}

function outsideRegion(side: BoundarySide, bounds: ReturnType<typeof polygonBounds>, flat: Flat): Position2D[] {
  const minX = side === "right" ? flat.width : bounds.minX;
  const maxX = side === "left" ? 0 : bounds.maxX;
  const minZ = side === "back" ? flat.depth : bounds.minZ;
  const maxZ = side === "front" ? 0 : bounds.maxZ;
  return rectanglePolygon({ position: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, width: maxX - minX, depth: maxZ - minZ, orientation: 0 });
}

export function issueItemIds(issue: LayoutViolation): string[] {
  return issue.code === "furniture" ? [issue.itemId, issue.obstacleId] : [issue.itemId];
}

export function issuePolygons(issues: readonly LayoutViolation[]) {
  return issues.flatMap((issue) => issue.code !== "height" && issue.polygon.length >= 3 ? [{ id: issue.id, polygon: issue.polygon, value: issue.code === "envelope" ? issue.excess : issue.penetration }] : []);
}