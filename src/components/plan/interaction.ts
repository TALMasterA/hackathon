import { pointPolygonDistance, rectanglePolygon } from "../../lib/geometry/oriented";
import type { FlatFurniture, Position2D } from "../../types/domain";

export interface PlanBox {
  minX: number;
  minZ: number;
  width: number;
  height: number;
}

export function clientToPlan(point: Position2D, screen: { left: number; top: number; width: number; height: number }, box: PlanBox): Position2D {
  const scale = Math.min(screen.width / box.width, screen.height / box.height);
  const offsetX = (screen.width - box.width * scale) / 2;
  const offsetZ = (screen.height - box.height * scale) / 2;
  return { x: box.minX + (point.x - screen.left - offsetX) / scale, z: box.minZ + (point.z - screen.top - offsetZ) / scale };
}

export function draggedPosition(origin: Position2D, start: Position2D, current: Position2D): Position2D {
  return { x: origin.x + current.x - start.x, z: origin.z + current.z - start.z };
}

export function nearestPlanItem(items: readonly FlatFurniture[], point: Position2D, radius: number): FlatFurniture | undefined {
  return items.map((item, index) => ({ item, index, distance: pointPolygonDistance(point, rectanglePolygon(item)) }))
    .filter((entry) => entry.distance <= radius)
    .sort((first, second) => first.distance - second.distance || second.index - first.index)[0]?.item;
}