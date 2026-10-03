import { pointPolygonDistance, polygonBounds, rectanglePolygon } from "../../lib/geometry/oriented";
import type { FlatFurniture, OrientedRectangle, Position2D } from "../../types/domain";

export interface PlanBox {
  minX: number;
  minZ: number;
  width: number;
  height: number;
}

export interface ViewLimits {
  home: PlanBox;
  minWidth: number;
}

export const PLAN_PADDING_CM = 20;
export const MIN_VIEW_WIDTH_CM = 120;
export const ROOM_MARGIN_CM = 30;

export function planHome(flat: { width: number; depth: number }): PlanBox {
  return { minX: -PLAN_PADDING_CM, minZ: -PLAN_PADDING_CM, width: flat.width + PLAN_PADDING_CM * 2, height: flat.depth + PLAN_PADDING_CM * 2 };
}

export function flatBounds(flat: { width: number; depth: number }): PlanBox {
  return { minX: 0, minZ: 0, width: flat.width, height: flat.depth };
}

export function fitRoomView(room: OrientedRectangle, margin: number, aspect: number): PlanBox {
  const bounds = polygonBounds(rectanglePolygon(room));
  const width = bounds.maxX - bounds.minX + margin * 2;
  const height = bounds.maxZ - bounds.minZ + margin * 2;
  const fitted = width / height > aspect ? { width, height: width / aspect } : { width: height * aspect, height };
  return { minX: (bounds.minX + bounds.maxX - fitted.width) / 2, minZ: (bounds.minZ + bounds.maxZ - fitted.height) / 2, ...fitted };
}

export function zoomAt(view: PlanBox, factor: number, anchor: Position2D, limits: ViewLimits): PlanBox {
  const width = Math.max(limits.minWidth, view.width / factor);
  if (width >= limits.home.width) return { ...limits.home };
  const ratio = width / view.width;
  return { minX: anchor.x - (anchor.x - view.minX) * ratio, minZ: anchor.z - (anchor.z - view.minZ) * ratio, width, height: view.height * ratio };
}

/** Keeps the view centre over the flat, so at least half of each axis (a quarter of the area) overlaps it. */
export function clampView(view: PlanBox, bounds: PlanBox): PlanBox {
  const centreX = Math.min(bounds.minX + bounds.width, Math.max(bounds.minX, view.minX + view.width / 2));
  const centreZ = Math.min(bounds.minZ + bounds.height, Math.max(bounds.minZ, view.minZ + view.height / 2));
  return { ...view, minX: centreX - view.width / 2, minZ: centreZ - view.height / 2 };
}

export function panBy(view: PlanBox, dx: number, dz: number, bounds: PlanBox): PlanBox {
  return clampView({ ...view, minX: view.minX + dx, minZ: view.minZ + dz }, bounds);
}

export function ensureVisible(view: PlanBox, polygon: readonly Position2D[]): PlanBox {
  const bounds = polygonBounds(polygon);
  if (bounds.minX >= view.minX && bounds.maxX <= view.minX + view.width && bounds.minZ >= view.minZ && bounds.maxZ <= view.minZ + view.height) return view;
  return { ...view, minX: (bounds.minX + bounds.maxX - view.width) / 2, minZ: (bounds.minZ + bounds.maxZ - view.height) / 2 };
}

export function isZoomed(view: PlanBox, home: PlanBox): boolean {
  return view.width < home.width - 1e-6;
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