import { isInk, type GrayImage } from "./image";

/** The plan's two most common pen widths in pixels: fixtures and swings (thin), walls (heavy). */
export interface Strokes {
  thin: number;
  heavy: number;
  /** False when one width dominates, so line weight cannot tell walls from fixtures. */
  distinct: boolean;
}

const SAMPLE_STEP = 4;
const SECOND_MODE_SHARE = 0.1;
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
  if (counts.size === 0) return { thin: 1, heavy: 1, distinct: false };

  const smoothed = (length: number) => (counts.get(length - 1) ?? 0) + (counts.get(length) ?? 0) + (counts.get(length + 1) ?? 0);
  const lengths = [...counts.keys()];
  const first = lengths.reduce((best, length) => smoothed(length) > smoothed(best) || (smoothed(length) === smoothed(best) && length < best) ? length : best);
  const others = lengths.filter((length) => Math.abs(length - first) >= Math.max(2, first / 2) && smoothed(length) >= smoothed(first) * SECOND_MODE_SHARE);
  const second = others.length > 0 ? others.reduce((best, length) => smoothed(length) > smoothed(best) ? length : best) : null;
  // Each mode refined to the count-weighted mean of its neighbourhood, which absorbs anti-aliasing.
  const refine = (mode: number) => {
    const near = [mode - 1, mode, mode + 1].map((length) => [length, counts.get(length) ?? 0] as const);
    return near.reduce((sum, [length, count]) => sum + length * count, 0) / near.reduce((sum, [, count]) => sum + count, 0);
  };
  const [thin, heavy] = second === null ? [refine(first), refine(first)] : [refine(Math.min(first, second)), refine(Math.max(first, second))];
  return { thin, heavy, distinct: heavy >= thin * DISTINCT_RATIO };
}
