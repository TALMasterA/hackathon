import type { Object3D } from "three";
import { objectBounds } from "../../components/scene/model-object";
import { isJobId, MODEL3D_MAX_PHOTO_BYTES, type Model3dErrorCode, type Model3dStatus } from "../../lib/model3d/contract";

export const PHOTO_MAX_SIDE_PX = 1024;
export const PHOTO_JPEG_QUALITY = 0.85;
export const POLL_INTERVAL_MS = 4000;
export const JOB_TIMEOUT_MS = 180_000;
export const MAX_GLB_BYTES = 30 * 1024 * 1024;

export type LookErrorCode = "disabled" | "rate-limited" | "invalid-photo" | "too-large" | "upstream" | "failed" | "timeout" | "network" | "cancelled" | "glb-type" | "glb-size" | "glb-parse";

export class LookError extends Error {
  constructor(readonly code: LookErrorCode) {
    super(code);
  }
}

export type JobPhase = "sending" | Exclude<Model3dStatus, "done" | "failed"> | "downloading";

const SERVER_ERRORS: Partial<Record<Model3dErrorCode, LookErrorCode>> = { disabled: "disabled", "rate-limited": "rate-limited", "invalid-count": "invalid-photo", "invalid-type": "invalid-photo", "too-large": "too-large", upstream: "upstream" };

async function serverError(response: Response): Promise<LookError> {
  const body = await response.json().catch(() => null) as { error?: Model3dErrorCode } | null;
  return new LookError((body?.error && SERVER_ERRORS[body.error]) || (response.status === 503 ? "disabled" : response.status === 429 ? "rate-limited" : "upstream"));
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface JobOptions {
  signal?: AbortSignal;
  onPhase?: (phase: JobPhase) => void;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

/**
 * Sends one already-resized photo to /api/model3d, polls every 4 s and downloads the GLB through the
 * app's own route. Stops with "timeout" after 180 s and "cancelled" when the caller aborts.
 */
export async function runModelJob(photo: Blob, { signal, onPhase, fetchImpl = fetch, pollMs = POLL_INTERVAL_MS, timeoutMs = JOB_TIMEOUT_MS }: JobOptions = {}): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const request = (url: string, init: RequestInit = {}) => fetchImpl(url, { ...init, cache: "no-store", signal: controller.signal });
  try {
    onPhase?.("sending");
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    const submitted = await request("/api/model3d", { method: "POST", body: form });
    if (!submitted.ok) throw await serverError(submitted);
    const { jobId } = await submitted.json() as { jobId?: string };
    if (typeof jobId !== "string" || !isJobId(jobId)) throw new LookError("upstream");
    let failures = 0;
    for (;;) {
      await wait(pollMs, controller.signal);
      const polled = await request(`/api/model3d/${jobId}`).catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return null;
      });
      if (!polled?.ok) {
        if (++failures >= 3) throw polled ? await serverError(polled) : new LookError("network");
        continue;
      }
      failures = 0;
      const { status } = await polled.json() as { status?: Model3dStatus };
      if (status === "done") break;
      if (status !== "queued" && status !== "running") throw new LookError("failed");
      onPhase?.(status);
    }
    onPhase?.("downloading");
    const file = await request(`/api/model3d/${jobId}/file`);
    if (!file.ok) throw new LookError("failed");
    return await file.arrayBuffer();
  } catch (error) {
    if (timedOut) throw new LookError("timeout");
    if (controller.signal.aborted) throw new LookError("cancelled");
    if (error instanceof LookError) throw error;
    throw new LookError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** Decodes with EXIF orientation applied; falls back to an <img> where createImageBitmap options are unsupported. */
async function decodePhoto(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new LookError("invalid-photo");
    }
  }
}

/** On-device resize to at most 1024 px on the longer side, flattened on white, JPEG quality 0.85. */
export async function resizePhoto(file: Blob): Promise<Blob> {
  const photo = await decodePhoto(file);
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE_PX / Math.max(photo.width, photo.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(photo.width * scale));
    canvas.height = Math.max(1, Math.round(photo.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new LookError("invalid-photo");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
    if (!blob) throw new LookError("invalid-photo");
    if (blob.size > MODEL3D_MAX_PHOTO_BYTES) throw new LookError("too-large");
    return blob;
  } finally {
    photo.release();
  }
}

/** Hex SHA-256 of the resized photo, or null where Web Crypto is unavailable (plain-HTTP LAN addresses). */
export async function photoHash(photo: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", await photo.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Session-only cache of finished GLBs by photo hash; it is never persisted. */
const sessionModels = new Map<string, ArrayBuffer>();

export const modelCache = {
  get: (hash: string | null) => (hash ? sessionModels.get(hash) : undefined),
  set: (hash: string | null, glb: ArrayBuffer) => { if (hash) sessionModels.set(hash, glb); },
};

const GLB_MAGIC = 0x46546c67;

/** Parses a binary glTF with Three.js' GLTFLoader (loaded on demand), without Draco and without any network access. */
export async function parseGlb(glb: ArrayBuffer): Promise<Object3D> {
  if (glb.byteLength < 12 || new DataView(glb).getUint32(0, true) !== GLB_MAGIC) throw new LookError("glb-type");
  if (glb.byteLength > MAX_GLB_BYTES) throw new LookError("glb-size");
  try {
    const [{ GLTFLoader }, { LoadingManager }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three")]);
    const manager = new LoadingManager();
    // Embedded buffers and images resolve to data:/blob: URLs; anything external is blocked, never fetched.
    manager.setURLModifier((url) => /^(data|blob):/.test(url) ? url : "data:,");
    const gltf = await new GLTFLoader(manager).parseAsync(glb.slice(0), "");
    objectBounds(gltf.scene);
    return gltf.scene;
  } catch {
    throw new LookError("glb-parse");
  }
}
