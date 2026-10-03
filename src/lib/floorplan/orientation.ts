import type { GrayImage } from "./image";

const MIN_GRADIENT = 60;
const BINS = 90;
/** Gradients within this many degrees of the coarse peak refine it. */
const REFINE_WINDOW = 12;

/**
 * The angle the drawing's walls run at, in degrees within (-45, 45], measured clockwise on screen
 * from the x axis: 0 for an axis-aligned plan, 45 for a wing drawn diagonally, a small value for a
 * skewed scan. Ink-edge directions are folded onto a quarter turn, so walls at right angles agree.
 * A 1° histogram finds the dominant direction; a magnitude-weighted circular mean of the gradients
 * near it then refines it, since anti-aliased edges put most single pixels at whole steps.
 */
export function dominantAngle(image: GrayImage): number {
  const histogram = new Float64Array(BINS);
  const angles: number[] = [];
  const weights: number[] = [];
  const { width, height, data } = image;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = (dx: number, dy: number) => data[(y + dy) * width + x + dx];
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      const magnitude = Math.hypot(gx, gy);
      if (magnitude < MIN_GRADIENT) continue;
      const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) % 90 + 90) % 90;
      histogram[Math.round(angle) % BINS] += magnitude;
      angles.push(angle);
      weights.push(magnitude);
    }
  }
  let peak = 0;
  for (let bin = 1; bin < BINS; bin++) if (histogram[bin] > histogram[peak]) peak = bin;
  if (histogram[peak] === 0) return 0;
  // Circular mean on the 90° period: each angle maps to a quarter-turn-periodic unit vector.
  let cosine = 0;
  let sine = 0;
  angles.forEach((angle, index) => {
    const offset = ((angle - peak + 135) % 90 + 90) % 90 - 45;
    if (Math.abs(offset) > REFINE_WINDOW) return;
    const radians = angle * 4 * Math.PI / 180;
    cosine += weights[index] * Math.cos(radians);
    sine += weights[index] * Math.sin(radians);
  });
  const mean = ((Math.atan2(sine, cosine) * 180 / Math.PI / 4) % 90 + 90) % 90;
  return mean > 45 ? mean - 90 : mean;
}
