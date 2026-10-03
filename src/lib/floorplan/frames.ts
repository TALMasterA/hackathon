import type { Box } from "../geometry/architecture";
import type { PlanPoint } from "./scale";

/**
 * Coordinate frames of a floor-plan trace.
 *
 * - Source: the picture's own units, y down: PDF points (page at scale 1) or image pixels.
 * - Crop: a rectangle of the source around one flat, its axes turned by `rotation` degrees (clockwise
 *   on screen) so the flat's walls run along them, in source units from its top-left corner.
 * - Raster: the crop rendered at `pxPerUnit` pixels per source unit, for analysis and the AI.
 * - Trace: centimetres in the crop's axes, from the calibrated `cmPerUnit` of the source.
 */
export interface CropFrame {
  centre: PlanPoint;
  rotation: number;
  width: number;
  height: number;
}

/** Canvas limits that hold on every browser, iOS Safari included (16.7 MP per canvas). */
export const CANVAS_LIMITS = { side: 4096, area: 16_000_000 };
/** Analysis resolution: finer than about 0.5 cm per pixel gains nothing on Housing Authority PDFs. */
export const TARGET_CM_PER_PX = 0.5;
/** A raster picture is enlarged at most this much for analysis; that adds smoothness, not detail. */
export const MAX_IMAGE_UPSCALE = 2;
/** The picture sent to the AI is at most this many pixels on its longer side. */
export const AI_IMAGE_SIDE = 1536;

const radians = (degrees: number) => degrees * Math.PI / 180;

export function sourceToCrop(frame: CropFrame, point: PlanPoint): PlanPoint {
  const [cos, sin] = [Math.cos(radians(frame.rotation)), Math.sin(radians(frame.rotation))];
  const [dx, dy] = [point.x - frame.centre.x, point.y - frame.centre.y];
  return { x: cos * dx + sin * dy + frame.width / 2, y: -sin * dx + cos * dy + frame.height / 2 };
}

export function cropToSource(frame: CropFrame, point: PlanPoint): PlanPoint {
  const [cos, sin] = [Math.cos(radians(frame.rotation)), Math.sin(radians(frame.rotation))];
  const [dx, dy] = [point.x - frame.width / 2, point.y - frame.height / 2];
  return { x: cos * dx - sin * dy + frame.centre.x, y: sin * dx + cos * dy + frame.centre.y };
}

/** Canvas matrix [a, b, c, d, e, f] from source units to raster pixels of the crop. */
export function cropRenderMatrix(frame: CropFrame, pxPerUnit: number): [number, number, number, number, number, number] {
  const [cos, sin] = [Math.cos(radians(frame.rotation)), Math.sin(radians(frame.rotation))];
  const k = pxPerUnit;
  return [k * cos, -k * sin, k * sin, k * cos, k * (frame.width / 2 - (cos * frame.centre.x + sin * frame.centre.y)), k * (frame.height / 2 - (-sin * frame.centre.x + cos * frame.centre.y))];
}

/** The crop around an axis-aligned box of the source, turned by `rotation` and padded on every side. */
export function cropAround(box: Box, rotation: number, padding: number): CropFrame {
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minZ + box.maxZ) / 2 };
  const probe: CropFrame = { centre, rotation, width: 0, height: 0 };
  const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]].map(([x, y]) => sourceToCrop(probe, { x, y }));
  const spanX = Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x));
  const spanY = Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y));
  return { centre, rotation, width: spanX + padding * 2, height: spanY + padding * 2 };
}

/** The whole source as an unturned crop, e.g. for the overview. */
export function wholeSource(size: { width: number; height: number }): CropFrame {
  return { centre: { x: size.width / 2, y: size.height / 2 }, rotation: 0, width: size.width, height: size.height };
}

/** The largest scale at or below the wanted one that keeps a raster within the canvas limits. */
export function fittedScale(size: { width: number; height: number }, wanted: number, limits = CANVAS_LIMITS): number {
  return Math.min(wanted, limits.side / Math.max(size.width, size.height), Math.sqrt(limits.area / (size.width * size.height)));
}

/** Pixels per source unit for analysing a crop: about 0.5 cm per pixel, never past the canvas limits. */
export function analysisScale(frame: CropFrame, cmPerUnit: number, kind: "pdf" | "image"): number {
  const wanted = cmPerUnit / TARGET_CM_PER_PX;
  return fittedScale(frame, kind === "image" ? Math.min(wanted, MAX_IMAGE_UPSCALE) : wanted);
}

/** Size of the image sent to the AI: the raster scaled down (or up, small crops) to 1536 px on its longer side. */
export function aiImageSize(raster: { width: number; height: number }): { width: number; height: number } {
  const scale = AI_IMAGE_SIDE / Math.max(raster.width, raster.height);
  return { width: Math.max(1, Math.round(raster.width * scale)), height: Math.max(1, Math.round(raster.height * scale)) };
}

/** A box in the AI's 0–1000 coordinates ([ymin, xmin, ymax, xmax], y first) as raster pixels. */
export function normalisedBox(box: readonly [number, number, number, number], raster: { width: number; height: number }): Box {
  const [ymin, xmin, ymax, xmax] = box;
  return { minX: (xmin / 1000) * raster.width, maxX: (xmax / 1000) * raster.width, minZ: (ymin / 1000) * raster.height, maxZ: (ymax / 1000) * raster.height };
}

/** A point in the AI's 0–1000 coordinates ([y, x]) as raster pixels. */
export function normalisedPoint(point: readonly [number, number], raster: { width: number; height: number }): PlanPoint {
  return { x: (point[1] / 1000) * raster.width, y: (point[0] / 1000) * raster.height };
}
