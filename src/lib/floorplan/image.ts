/** A greyscale raster: row-major, one byte per pixel, 0 = black ink, 255 = white paper. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A pixel counts as ink at half intensity or darker, which keeps anti-aliased edges in place. */
export const INK_MAX = 127;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createGrayImage(width: number, height: number, value = 255): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(value) };
}

/** Luminance from canvas RGBA, composited on white so transparent PDF backgrounds read as paper. */
export function grayFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    const luminance = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
    data[index] = Math.round(255 - (rgba[offset + 3] / 255) * (255 - luminance));
  }
  return { width, height, data };
}

/** Whites out rectangles (e.g. text labels), so letters are never mistaken for short wall stubs. */
export function maskRects(image: GrayImage, rects: readonly PixelRect[]): GrayImage {
  const data = image.data.slice();
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x));
    const x1 = Math.min(image.width, Math.ceil(rect.x + rect.width));
    const y0 = Math.max(0, Math.floor(rect.y));
    const y1 = Math.min(image.height, Math.ceil(rect.y + rect.height));
    for (let y = y0; y < y1; y++) data.fill(255, y * image.width + x0, y * image.width + Math.max(x0, x1));
  }
  return { ...image, data };
}

/** Ink darkness 0–1 of one pixel; outside the image is paper. */
export function darkness(image: GrayImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  return (255 - image.data[y * image.width + x]) / 255;
}

export function isInk(image: GrayImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < image.width && y < image.height && image.data[y * image.width + x] <= INK_MAX;
}
