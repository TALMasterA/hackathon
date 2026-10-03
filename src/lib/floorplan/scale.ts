import { darkness, type GrayImage } from "./image";

export interface PlanPoint {
  x: number;
  y: number;
}

const PEAK_SHARE = 0.3;
/** At least this much extra ink (in pixels) in a column before it can be a tick. */
const MIN_TICK_INK = 1.5;

/**
 * Moves a tap onto the centre of the nearest vertical tick line, to a fraction of a pixel: each
 * column's ink in a window around the tap, minus the median column, so the horizontal bar and other
 * even ink cancel out, then the darkness-weighted centre of the peak nearest the tap.
 */
export function snapTick(image: GrayImage, tap: PlanPoint, radius: number): PlanPoint | null {
  const x0 = Math.max(0, Math.floor(tap.x - radius));
  const x1 = Math.min(image.width - 1, Math.ceil(tap.x + radius));
  const y0 = Math.max(0, Math.floor(tap.y - radius));
  const y1 = Math.min(image.height - 1, Math.ceil(tap.y + radius));
  if (x1 <= x0 || y1 <= y0) return null;
  const columns: number[] = [];
  for (let x = x0; x <= x1; x++) {
    let sum = 0;
    for (let y = y0; y <= y1; y++) sum += darkness(image, x, y);
    columns.push(sum);
  }
  const baseline = [...columns].sort((first, second) => first - second)[Math.floor(columns.length / 2)];
  const excess = columns.map((value) => Math.max(0, value - baseline));
  const threshold = Math.max(MIN_TICK_INK, Math.max(...excess) * PEAK_SHARE);
  const peaks: number[] = [];
  for (let index = 0; index < excess.length; index++) {
    if (excess[index] < threshold) continue;
    let end = index;
    while (end + 1 < excess.length && excess[end + 1] >= threshold) end++;
    let weight = 0;
    let moment = 0;
    for (let column = Math.max(0, index - 1); column <= Math.min(excess.length - 1, end + 1); column++) {
      weight += excess[column];
      moment += excess[column] * (x0 + column + 0.5);
    }
    peaks.push(moment / weight);
    index = end;
  }
  if (peaks.length === 0) return null;
  const x = peaks.reduce((best, peak) => Math.abs(peak - tap.x) < Math.abs(best - tap.x) ? peak : best);
  return { x, y: tap.y };
}

/** Centimetres per picture unit from two points a known real distance apart. */
export function scaleFromTaps(first: PlanPoint, second: PlanPoint, lengthCm: number): number | null {
  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  return distance > 0 && lengthCm > 0 ? lengthCm / distance : null;
}
