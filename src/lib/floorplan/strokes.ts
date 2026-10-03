import { isInk, type GrayImage } from "./image";

/**
 * The plan's common pen widths in pixels, thinnest first. Housing Authority plans use three: thin for
 * fixtures, swings and glazing, medium for partitions, heavy for structural walls.
 */
export interface Strokes {
  thin: number;
  heavy: number;
  pens: number[];
  /** False when one width dominates, so line weight cannot tell walls from fixtures. */
  distinct: boolean;
}

const SAMPLE_STEP = 4;
const PEN_SHARE = 0.1;
const PEN_SEPARATION = 0.4;
const PEN_SAME = 0.3;
const DISTINCT_RATIO = 1.5;

/**
 * Measures pen widths from ink runs crossed by every 4th row and column. Runs longer than maxRunPx
 * are strokes followed along their length, not across, and are ignored.
 */
export function strokeWidths(image: GrayImage, maxRunPx: number): Strokes {
  const counts = new Map<number, number>();
  const scan = (length: number, lines: number, ink: (line: number, position: number) => boolean) => {
    for (let line = 0; line < lines; line += SAMPLE_STEP) {
      let start = -1;
      for (let position = 0; position <= length; position++) {
        const dark = position < length && ink(line, position);
        if (dark && start < 0) start = position;
        if (!dark && start >= 0) {
          const run = position - start;
          // Runs touching the image border may be cut off, so their width is unknown.
          if (start > 0 && position < length && run <= maxRunPx) counts.set(run, (counts.get(run) ?? 0) + 1);
          start = -1;
        }
      }
    }
  };
  scan(image.width, image.height, (y, x) => isInk(image, x, y));
  scan(image.height, image.width, (x, y) => isInk(image, x, y));
  if (counts.size === 0) return { thin: 1, heavy: 1, pens: [1], distinct: false };

  const smoothed = (length: number) => (counts.get(length - 1) ?? 0) + (counts.get(length) ?? 0) + (counts.get(length + 1) ?? 0);
  const support = Math.max(...[...counts.keys()].map(smoothed)) * PEN_SHARE;
  // Pens are the strongest widths, each at least 40 % (and 2 px) away from every stronger one.
  const modes: number[] = [];
  for (const length of [...counts.keys()].sort((first, second) => smoothed(second) - smoothed(first) || first - second)) {
    if (smoothed(length) < support) break;
    if (modes.every((mode) => Math.abs(length - mode) >= Math.max(2, Math.min(length, mode) * PEN_SEPARATION))) modes.push(length);
  }
  // Each mode refined to the count-weighted mean of its neighbourhood, which absorbs anti-aliasing.
  const refine = (mode: number) => {
    const near = [mode - 1, mode, mode + 1].map((length) => [length, counts.get(length) ?? 0] as const);
    return near.reduce((sum, [length, count]) => sum + length * count, 0) / near.reduce((sum, [, count]) => sum + count, 0);
  };
  // Anti-aliasing can split one pen into neighbouring modes; after refining, a mode within 30 % of a
  // stronger one is the same pen.
  const pens = modes.map(refine).filter((pen, index, all) => all.slice(0, index).every((stronger) => Math.abs(pen - stronger) >= Math.min(pen, stronger) * PEN_SAME)).sort((first, second) => first - second);
  return { thin: pens[0], heavy: pens[pens.length - 1], pens, distinct: pens[pens.length - 1] >= pens[0] * DISTINCT_RATIO };
}
