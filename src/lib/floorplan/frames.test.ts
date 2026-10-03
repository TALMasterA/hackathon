import { describe, expect, it } from "vitest";
import { aiImageSize, analysisScale, CANVAS_LIMITS, cropAround, cropRenderMatrix, cropToSource, fittedScale, normalisedBox, normalisedPoint, sourceToCrop, type CropFrame } from "./frames";

const apply = ([a, b, c, d, e, f]: number[], point: { x: number; y: number }) => ({ x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f });

describe("trace coordinate frames", () => {
  const frames: CropFrame[] = [
    { centre: { x: 500, y: 200 }, rotation: 0, width: 120, height: 90 },
    { centre: { x: 500, y: 200 }, rotation: 45, width: 150, height: 150 },
    { centre: { x: 10, y: -40 }, rotation: -31.7, width: 80, height: 60 },
  ];

  it.each(frames.map((frame) => [frame.rotation, frame]))("round-trips source and crop points at %s°", (_, frame) => {
    for (const point of [{ x: 480, y: 190 }, { x: 0, y: 0 }, { x: 523.25, y: 251.5 }]) {
      const back = cropToSource(frame, sourceToCrop(frame, point));
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it("puts the crop centre in the middle of the crop and keeps lengths", () => {
    const frame = frames[1];
    expect(sourceToCrop(frame, frame.centre)).toEqual({ x: 75, y: 75 });
    const [first, second] = [sourceToCrop(frame, { x: 0, y: 0 }), sourceToCrop(frame, { x: 30, y: 40 })];
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeCloseTo(50, 9);
  });

  it("turns a wall running at 45° on screen to run along the crop's x axis", () => {
    const frame = frames[1];
    const [first, second] = [sourceToCrop(frame, { x: 500, y: 200 }), sourceToCrop(frame, { x: 510, y: 210 })];
    expect(second.y - first.y).toBeCloseTo(0, 9);
    expect(second.x - first.x).toBeCloseTo(Math.SQRT2 * 10, 9);
  });

  it.each(frames.map((frame) => [frame.rotation, frame]))("renders with a matrix that agrees with the point mapping at %s°", (_, frame) => {
    const matrix = cropRenderMatrix(frame, 3.5);
    for (const point of [{ x: 480, y: 190 }, { x: 512, y: 207 }]) {
      const crop = sourceToCrop(frame, point);
      const pixel = apply(matrix, point);
      expect(pixel.x).toBeCloseTo(crop.x * 3.5, 9);
      expect(pixel.y).toBeCloseTo(crop.y * 3.5, 9);
    }
  });

  it("pads the crop around a box, growing it when turned", () => {
    expect(cropAround({ minX: 100, maxX: 200, minZ: 50, maxZ: 90 }, 0, 10)).toEqual({ centre: { x: 150, y: 70 }, rotation: 0, width: 120, height: 60 });
    const turned = cropAround({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, 45, 0);
    expect(turned.width).toBeCloseTo(100 * Math.SQRT2, 9);
  });

  it("keeps rasters inside the canvas limits", () => {
    expect(fittedScale({ width: 100, height: 50 }, 10)).toBe(10);
    expect(fittedScale({ width: 1162, height: 805 }, 20) * 1162).toBeCloseTo(CANVAS_LIMITS.side, 6);
    const square = fittedScale({ width: 1000, height: 1000 }, 100);
    expect(square * 1000 * square * 1000).toBeLessThanOrEqual(CANVAS_LIMITS.area + 1e-6);
  });

  it("analyses PDFs at 0.5 cm per pixel and never enlarges pictures more than twice", () => {
    const frame = { centre: { x: 0, y: 0 }, rotation: 0, width: 120, height: 125 };
    expect(analysisScale(frame, 7.1454, "pdf")).toBeCloseTo(14.2908, 6);
    expect(analysisScale(frame, 10, "image")).toBe(2);
    expect(analysisScale({ ...frame, width: 2000, height: 2000 }, 1, "image")).toBe(2);
  });

  it("sizes the AI image to 1536 px on its longer side", () => {
    expect(aiImageSize({ width: 3000, height: 1500 })).toEqual({ width: 1536, height: 768 });
    expect(aiImageSize({ width: 400, height: 800 })).toEqual({ width: 768, height: 1536 });
  });

  it("reads the AI's y-first 0–1000 boxes and points as raster pixels", () => {
    expect(normalisedBox([100, 250, 500, 750], { width: 2000, height: 1000 })).toEqual({ minX: 500, maxX: 1500, minZ: 100, maxZ: 500 });
    expect(normalisedPoint([500, 250], { width: 2000, height: 1000 })).toEqual({ x: 500, y: 500 });
  });
});
