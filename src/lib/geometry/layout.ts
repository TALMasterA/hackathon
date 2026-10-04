import type { BoundarySide, Flat, FlatFurniture, LayoutViolation, Position2D } from "../../types/domain";
import { doorGeometry, flatVoids, wallParts } from "./architecture";
import { GEOMETRY_EPSILON_CM } from "./footprint";
import { clipPolygon, polygonBounds, polygonOutsideArea, polygonOverlap, rectanglePolygon } from "./oriented";

type Bounds = ReturnType<typeof polygonBounds>;
interface Obstacle {
  id: string;
  polygon: Position2D[];
  bounds: Bounds;
}
interface Obstacles {
  walls: (Obstacle & { wallId: string })[];
  doors: Obstacle[];
  voids: Obstacle[];
}

const obstacle = <T extends { polygon: Position2D[] }>(entry: T): T & { bounds: Bounds } => ({ ...entry, bounds: polygonBounds(entry.polygon) });
const obstacleCache = new WeakMap<Flat["walls"], { flat: Pick<Flat, "doors" | "rooms" | "outline" | "width" | "depth">; obstacles: Obstacles }>();

/** Wall parts, door swing zones and voids of a flat, prepared once per flat and shared by every check. */
function flatObstacles(flat: Flat): Obstacles {
  const cached = obstacleCache.get(flat.walls);
  if (cached && cached.flat.doors === flat.doors && cached.flat.rooms === flat.rooms && cached.flat.outline === flat.outline && cached.flat.width === flat.width && cached.flat.depth === flat.depth) return cached.obstacles;
  const obstacles: Obstacles = {
    walls: wallParts(flat).map((part) => obstacle({ id: part.id, wallId: part.wallId, polygon: rectanglePolygon(part) })),
    doors: flat.doors.map((door) => obstacle({ id: door.id, polygon: rectanglePolygon(doorGeometry(door, flat).zone) })),
    voids: flatVoids(flat).map((area, index) => obstacle({ id: `void-${index}`, polygon: rectanglePolygon(area) })),
  };
  obstacleCache.set(flat.walls, { flat: { doors: flat.doors, rooms: flat.rooms, outline: flat.outline, width: flat.width, depth: flat.depth }, obstacles });
  return obstacles;
}

/** True when two bounding boxes are strictly apart, so the polygons cannot overlap (a cheap pre-test of the SAT). */
const apart = (first: Bounds, second: Bounds) => first.maxX < second.minX || second.maxX < first.minX || first.maxZ < second.minZ || second.maxZ < first.minZ;

function furnitureViolation(item: FlatFurniture, polygon: Position2D[], bounds: Bounds, other: FlatFurniture, otherPolygon: Position2D[], otherBounds: Bounds): LayoutViolation | null {
  if (apart(bounds, otherBounds)) return null;
  const overlap = polygonOverlap(polygon, otherPolygon);
  return overlap ? { code: "furniture", id: `furniture-${item.id}-${other.id}`, itemId: item.id, obstacleId: other.id, ...overlap } : null;
}

/** Every warning of one item except overlaps with furniture after it, in the order analyzeLayout reports them. */
function ownViolations(flat: Flat, obstacles: Obstacles, item: FlatFurniture, polygon: Position2D[], bounds: Bounds, ceilingHeight: number, later: readonly { item: FlatFurniture; polygon: Position2D[]; bounds: Bounds }[]): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  if (flat.outline && polygonOutsideArea(polygon, flat.outline) > GEOMETRY_EPSILON_CM * (item.width + item.depth) * 2) {
    violations.push({ code: "envelope", id: `envelope-${item.id}-outline`, itemId: item.id, side: "outline", excess: 0, polygon });
  }
  const sides: [BoundarySide, number][] = [["left", -bounds.minX], ["right", bounds.maxX - flat.width], ["front", -bounds.minZ], ["back", bounds.maxZ - flat.depth]];
  for (const [side, excess] of sides) {
    if (excess <= GEOMETRY_EPSILON_CM) continue;
    const region = outsideRegion(side, bounds, flat);
    violations.push({ code: "envelope", id: `envelope-${item.id}-${side}`, itemId: item.id, side, excess, polygon: clipPolygon(polygon, region) });
  }
  for (const area of obstacles.voids) {
    const overlap = apart(bounds, area.bounds) ? null : polygonOverlap(polygon, area.polygon);
    if (overlap) violations.push({ code: "outside", id: `outside-${item.id}-${area.id}`, itemId: item.id, ...overlap });
  }
  if (item.height > ceilingHeight) violations.push({ code: "height", id: `height-${item.id}`, itemId: item.id, excess: item.height - ceilingHeight });
  for (const other of later) {
    const violation = furnitureViolation(item, polygon, bounds, other.item, other.polygon, other.bounds);
    if (violation) violations.push(violation);
  }
  for (const wall of obstacles.walls) {
    const overlap = apart(bounds, wall.bounds) ? null : polygonOverlap(polygon, wall.polygon);
    if (overlap) violations.push({ code: "wall", id: `wall-${item.id}-${wall.id}`, itemId: item.id, obstacleId: wall.wallId, ...overlap });
  }
  for (const door of obstacles.doors) {
    const overlap = apart(bounds, door.bounds) ? null : polygonOverlap(polygon, door.polygon);
    if (overlap) violations.push({ code: "door", id: `door-${item.id}-${door.id}`, itemId: item.id, obstacleId: door.id, ...overlap });
  }
  return violations;
}

function prepared(furniture: readonly FlatFurniture[]) {
  return furniture.map((item) => {
    const polygon = rectanglePolygon(item);
    return { item, polygon, bounds: polygonBounds(polygon) };
  });
}

export function analyzeLayout(flat: Flat, furniture: readonly FlatFurniture[], ceilingHeight: number): LayoutViolation[] {
  const obstacles = flatObstacles(flat);
  const items = prepared(furniture);
  return items.flatMap((entry, index) => ownViolations(flat, obstacles, entry.item, entry.polygon, entry.bounds, ceilingHeight, items.slice(index + 1)));
}

/**
 * The warnings analyzeLayout would report that involve one item, in the same order and with the same
 * values, without checking every other pair: used to test many candidate poses of a single item.
 */
export function itemViolations(flat: Flat, furniture: readonly FlatFurniture[], itemId: string, ceilingHeight: number): LayoutViolation[] {
  const index = furniture.findIndex((item) => item.id === itemId);
  if (index < 0) return [];
  const obstacles = flatObstacles(flat);
  const items = prepared(furniture);
  const own = items[index];
  const earlier = items.slice(0, index).flatMap((entry) => {
    const violation = furnitureViolation(entry.item, entry.polygon, entry.bounds, own.item, own.polygon, own.bounds);
    return violation ? [violation] : [];
  });
  return [...earlier, ...ownViolations(flat, obstacles, own.item, own.polygon, own.bounds, ceilingHeight, items.slice(index + 1))];
}

function outsideRegion(side: BoundarySide, bounds: Bounds, flat: Flat): Position2D[] {
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
  return issues.flatMap((issue) => issue.code !== "height" && issue.polygon.length >= 3 ? [{ id: issue.id, polygon: issue.polygon, value: issue.code === "envelope" ? issue.side === "outline" ? null : issue.excess : issue.penetration }] : []);
}
