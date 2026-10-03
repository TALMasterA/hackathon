import type { Object3D } from "three";
import { matteLookMaterials, objectBounds } from "../../components/scene/model-object";
import { MODEL3D_MAX_MODEL_BYTES, MODEL3D_MAX_PHOTO_BYTES, type Model3dErrorCode, type Model3dEvent, type Model3dStatus } from "../../lib/model3d/contract";

export const PHOTO_MAX_SIDE_PX = 1024;
export const PHOTO_JPEG_QUALITY = 0.85;
export const JOB_TIMEOUT_MS = 180_000;

export type LookErrorCode = "disabled" | "rate-limited" | "invalid-photo" | "too-large" | "upstream" | "failed" | "timeout" | "network" | "cancelled";

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

/** One parsed event per NDJSON line of the model stream. */
async function* streamEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Model3dEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = done ? "" : lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as Model3dEvent;
      } catch {
        throw new LookError("upstream");
      }
    }
    if (done) return;
  }
}

function base64Bytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export interface JobOptions {
  signal?: AbortSignal;
  onPhase?: (phase: JobPhase) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends one already-resized photo to /api/model3d and reads its stream of phases until the GLB
 * arrives. Stops with "timeout" after 180 s and "cancelled" when the caller aborts; closing the
 * response also lets the server cancel a job still waiting in fal's queue.
 */
export async function runModelJob(photo: Blob, { signal, onPhase, fetchImpl = fetch, timeoutMs = JOB_TIMEOUT_MS }: JobOptions = {}): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    onPhase?.("sending");
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    const response = await fetchImpl("/api/model3d", { method: "POST", body: form, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw await serverError(response);
    if (!response.body) throw new LookError("upstream");
    for await (const event of streamEvents(response.body)) {
      // A model over the size cap is reported like any other unusable result.
      if ("error" in event) throw new LookError(event.error === "upstream" ? "upstream" : "failed");
      if (event.phase === "done") return base64Bytes(event.glb);
      onPhase?.(event.phase);
    }
    throw new LookError("network");
  } catch (error) {
    if (timedOut) throw new LookError("timeout");
    if (controller.signal.aborted) throw new LookError("cancelled");
    if (error instanceof LookError) throw error;
    throw new LookError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
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

/**
 * Parses an AI-made binary glTF with Three.js' GLTFLoader (loaded on demand), without Draco and without
 * any network access, then makes its materials matte so the photo's colours show.
 */
export async function parseGlb(glb: ArrayBuffer): Promise<Object3D> {
  if (glb.byteLength < 12 || glb.byteLength > MODEL3D_MAX_MODEL_BYTES || new DataView(glb).getUint32(0, true) !== GLB_MAGIC) throw new LookError("failed");
  try {
    const [{ GLTFLoader }, { LoadingManager }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three")]);
    const manager = new LoadingManager();
    // Embedded buffers and images resolve to data:/blob: URLs; anything external is blocked, never fetched.
    manager.setURLModifier((url) => /^(data|blob):/.test(url) ? url : "data:,");
    const gltf = await new GLTFLoader(manager).parseAsync(glb.slice(0), "");
    objectBounds(gltf.scene);
    matteLookMaterials(gltf.scene);
    return gltf.scene;
  } catch {
    throw new LookError("failed");
  }
}
