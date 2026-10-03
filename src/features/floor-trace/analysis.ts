import type { Box } from "@/lib/geometry/architecture";
import { analysisScale, cropAround, sourceToCrop, type CropFrame } from "@/lib/floorplan/frames";
import { grayFromRgba, maskRects, type GrayImage } from "@/lib/floorplan/image";
import { tickSearch, findScaleBar, type TextBox } from "@/lib/floorplan/labels";
import { dominantAngle } from "@/lib/floorplan/orientation";
import { snapTick, type PlanPoint } from "@/lib/floorplan/scale";
import type { SnapContext } from "@/lib/floorplan/snap";
import { strokeWidths } from "@/lib/floorplan/strokes";
import { canvasUrl, type PlanSource } from "./plan-source";

/** The cropped plan of the user's flat, rendered sharp and measured, ready for snapping and the AI. */
export interface PlanAnalysis {
  frame: CropFrame;
  pxPerUnit: number;
  cmPerUnit: number;
  context: SnapContext;
  canvas: HTMLCanvasElement;
  /** PNG object URL of the crop for display; revoke with releaseAnalysis. */
  url: string;
  widthCm: number;
  heightCm: number;
}

/** The crop reaches this far past the user's box, so walls on its edge are inside it. */
const PADDING_CM = 60;
const PADDING_SHARE = 0.05;
/** Strokes thicker than this are walls followed along their length, not pens. */
const MAX_PEN_CM = 15;
/** Scale-bar ticks are snapped on a local render this sharp (pixels per source unit, PDFs). */
const TICK_PX_PER_POINT = 20;
const ANGLE_SAMPLE_SIDE = 1024;
const TEXT_MASK_PAD_PX = 2;

function grayOf(canvas: HTMLCanvasElement): GrayImage {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  return grayFromRgba(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

/** Text boxes of the source inside a crop, as padded raster rectangles to white out. */
function textMasks(texts: readonly TextBox[], frame: CropFrame, pxPerUnit: number) {
  return texts.map((text) => {
    const corners = [[text.x, text.y], [text.x + text.width, text.y], [text.x + text.width, text.y + text.height], [text.x, text.y + text.height]].map(([x, y]) => sourceToCrop(frame, { x, y }));
    const xs = corners.map((point) => point.x * pxPerUnit);
    const ys = corners.map((point) => point.y * pxPerUnit);
    return { x: Math.min(...xs) - TEXT_MASK_PAD_PX, y: Math.min(...ys) - TEXT_MASK_PAD_PX, width: Math.max(...xs) - Math.min(...xs) + TEXT_MASK_PAD_PX * 2, height: Math.max(...ys) - Math.min(...ys) + TEXT_MASK_PAD_PX * 2 };
  });
}

export async function analysePlan(source: PlanSource, box: Box, rotation: number, cmPerUnit: number): Promise<PlanAnalysis> {
  const padding = Math.max(PADDING_CM / cmPerUnit, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) * PADDING_SHARE);
  const frame = cropAround(box, rotation, padding);
  const pxPerUnit = analysisScale(frame, cmPerUnit, source.kind);
  const canvas = await source.render(frame, pxPerUnit);
  const image = maskRects(grayOf(canvas), textMasks(await source.text(), frame, pxPerUnit));
  const cmPerPx = cmPerUnit / pxPerUnit;
  return {
    frame,
    pxPerUnit,
    cmPerUnit,
    context: { image, cmPerPx, strokes: strokeWidths(image, MAX_PEN_CM / cmPerPx) },
    canvas,
    url: await canvasUrl(canvas),
    widthCm: frame.width * cmPerUnit,
    heightCm: frame.height * cmPerUnit,
  };
}

export function releaseAnalysis(analysis: PlanAnalysis | null): void {
  if (analysis) URL.revokeObjectURL(analysis.url);
}

/** Snaps a tap to the nearest scale-bar tick on a sharp local render; null when no tick is near. */
export async function snapToTick(source: PlanSource, tap: PlanPoint, radius: number): Promise<PlanPoint | null> {
  const pxPerUnit = source.kind === "pdf" ? TICK_PX_PER_POINT : 1;
  const frame: CropFrame = { centre: tap, rotation: 0, width: radius * 2, height: radius * 2 };
  const texts = await source.text();
  const image = maskRects(grayOf(await source.render(frame, pxPerUnit)), textMasks(texts, frame, pxPerUnit));
  const tick = snapTick(image, { x: radius * pxPerUnit, y: radius * pxPerUnit }, radius * pxPerUnit);
  return tick ? { x: tap.x - radius + tick.x / pxPerUnit, y: tap.y } : null;
}

/** The plan's own scale bar, from its labels and ticks: the two tick points and the length between. */
export async function findScale(source: PlanSource): Promise<{ points: [PlanPoint, PlanPoint]; lengthCm: number } | null> {
  const bar = findScaleBar(await source.text());
  if (!bar) return null;
  const [zero, end] = [tickSearch(bar.zero), tickSearch(bar.end)];
  const [first, second] = await Promise.all([snapToTick(source, zero.tap, zero.radius), snapToTick(source, end.tap, end.radius)]);
  // Both ticks share the labels' line, so the measured distance is purely along the bar.
  return first && second ? { points: [first, { x: second.x, y: first.y }], lengthCm: bar.metres * 100 } : null;
}

/** The angle of the walls inside a box of the source, from a quick render of just that box. */
export async function measureAngle(source: PlanSource, box: Box): Promise<number> {
  const frame = cropAround(box, 0, 0);
  const pxPerUnit = Math.min(source.kind === "pdf" ? 8 : 1, ANGLE_SAMPLE_SIDE / Math.max(frame.width, frame.height));
  return dominantAngle(grayOf(await source.render(frame, pxPerUnit)));
}
