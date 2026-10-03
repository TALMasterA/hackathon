import { validateAiPlan } from "@/lib/floorplan/ai-parse";
import type { FloorplanErrorCode, FloorplanReading } from "@/lib/floorplan/ai-contract";
import { aiImageSize, sourceToCrop, type CropFrame } from "@/lib/floorplan/frames";
import type { Box } from "@/lib/geometry/architecture";
import { MODEL3D_MAX_PHOTO_BYTES } from "@/lib/model3d/contract";
import type { FlatType } from "@/lib/floorplan/trace";

export const READ_TIMEOUT_MS = 120_000;

export type ReadErrorCode = "disabled" | "rate-limited" | "invalid-picture" | "too-large" | "upstream" | "unreadable" | "timeout" | "network" | "cancelled";

export class ReadError extends Error {
  constructor(readonly code: ReadErrorCode) {
    super(code);
  }
}

const SERVER_ERRORS: Partial<Record<FloorplanErrorCode, ReadErrorCode>> = { disabled: "disabled", "rate-limited": "rate-limited", "invalid-count": "invalid-picture", "invalid-type": "invalid-picture", "invalid-hint": "invalid-picture", "too-large": "too-large", upstream: "upstream", unreadable: "unreadable", timeout: "timeout" };

async function serverError(response: Response): Promise<ReadError> {
  const body = await response.json().catch(() => null) as { error?: FloorplanErrorCode } | null;
  return new ReadError((body?.error && SERVER_ERRORS[body.error]) || (response.status === 503 ? "disabled" : response.status === 429 ? "rate-limited" : "upstream"));
}

export interface ReadOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends the prepared plan picture to /api/floorplan and returns the checked reading. Stops with
 * "timeout" after two minutes and "cancelled" when the caller aborts. The reading is checked again
 * here, so nothing malformed reaches the trace even from a misbehaving server.
 */
export async function readPlanWithAi(picture: Blob, flatType: FlatType | null, { signal, fetchImpl = fetch, timeoutMs = READ_TIMEOUT_MS }: ReadOptions = {}): Promise<FloorplanReading> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const form = new FormData();
    form.append("photo", picture, picture.type === "image/jpeg" ? "plan.jpg" : "plan.png");
    const response = await fetchImpl(`/api/floorplan${flatType ? `?type=${flatType}` : ""}`, { method: "POST", body: form, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw await serverError(response);
    const body = await response.json() as Partial<FloorplanReading>;
    const checked = validateAiPlan(body.plan);
    if (!checked.ok || typeof body.model !== "string") throw new ReadError("unreadable");
    return { plan: checked.plan, model: body.model, repaired: body.repaired === true, dropped: (body.dropped ?? 0) + checked.dropped };
  } catch (error) {
    if (timedOut) throw new ReadError("timeout");
    if (controller.signal.aborted) throw new ReadError("cancelled");
    if (error instanceof ReadError) throw error;
    throw new ReadError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** The user's box in raster pixels of the analysed crop (a turned box becomes a quadrilateral). */
export function boxInRaster(box: Box, frame: CropFrame, pxPerUnit: number): { corners: { x: number; y: number }[]; bounds: Box } {
  const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]].map(([x, y]) => {
    const point = sourceToCrop(frame, { x, y });
    return { x: point.x * pxPerUnit, y: point.y * pxPerUnit };
  });
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return { corners, bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...ys), maxZ: Math.max(...ys) } };
}

const FADE = "rgba(255, 255, 255, 0.6)";
const OUTLINE = "#202c29";

/**
 * The picture sent to the AI: the analysed crop scaled to 1536 px on its longer side, everything
 * outside the user's box faded and the box outlined, as the prompt describes. PNG keeps line
 * drawings crisp; an over-large one falls back to JPEG.
 */
export async function aiPicture(raster: HTMLCanvasElement, corners: readonly { x: number; y: number }[]): Promise<Blob> {
  const size = aiImageSize(raster);
  const scale = size.width / raster.width;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new ReadError("invalid-picture");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(raster, 0, 0, size.width, size.height);
  const outline = new Path2D();
  corners.forEach((point, index) => (index === 0 ? outline.moveTo : outline.lineTo).call(outline, point.x * scale, point.y * scale));
  outline.closePath();
  const outside = new Path2D();
  outside.rect(0, 0, size.width, size.height);
  outside.addPath(outline);
  context.fillStyle = FADE;
  context.fill(outside, "evenodd");
  context.strokeStyle = OUTLINE;
  context.lineWidth = Math.max(2, size.width / 400);
  context.stroke(outline);
  const encode = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const png = await encode("image/png");
  if (png && png.size <= MODEL3D_MAX_PHOTO_BYTES) return png;
  const jpeg = await encode("image/jpeg", 0.92);
  if (!jpeg || jpeg.size > MODEL3D_MAX_PHOTO_BYTES) throw new ReadError("too-large");
  return jpeg;
}
