import { MODEL3D_MAX_MODEL_BYTES, MODEL3D_MAX_PHOTO_BYTES, MODEL3D_STREAM_TYPE, type Model3dEvent } from "@/lib/model3d/contract";
import { FAL_STORAGE, falClient, jsonResponse, mapQueueStatus, model3dEnabled, upstreamStatus } from "@/lib/model3d/fal-server";
import { selectedModel } from "@/lib/model3d/models";
import { clientIp, RateLimiter } from "@/lib/model3d/rate-limit";
import { validatePhotoForm } from "@/lib/model3d/validation";

const limiter = new RateLimiter();
/** Multipart overhead allowance on top of the 4 MB photo before the body is even parsed. */
const MAX_BODY_BYTES = MODEL3D_MAX_PHOTO_BYTES + 64 * 1024;
/** fal is asked for the job's status this often while FitIn's client waits on one open response. */
const STATUS_POLL_MS = 1000;

/** Reads the finished GLB, refusing anything over the cap even without a Content-Length. */
async function downloadGlb(url: string, signal: AbortSignal): Promise<Uint8Array | "too-large" | null> {
  const response = await fetch(url, { cache: "no-store", signal }).catch(() => null);
  if (!response?.ok || !response.body) return null;
  if (Number(response.headers.get("content-length") ?? 0) > MODEL3D_MAX_MODEL_BYTES) return "too-large";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MODEL3D_MAX_MODEL_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "too-large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Builds the model while the client waits on one response: upload, submit, status updates, result and
 * GLB, each sent as an NDJSON line the moment it happens. A client that disconnects stops the wait,
 * and a job still in fal's queue is cancelled.
 */
function streamModel(photo: File, requestSignal: AbortSignal): Response {
  const model = selectedModel();
  const fal = falClient();
  const started = Date.now();
  const abort = new AbortController();
  let requestId: string | null = null;
  let finished = false;
  const stop = () => {
    if (finished || abort.signal.aborted) return;
    abort.abort();
    if (requestId) fal.queue.cancel(model.endpoint, { requestId }).catch(() => undefined);
  };
  requestSignal.addEventListener("abort", stop, { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const t = () => Date.now() - started;
      const send = (event: Model3dEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const imageUrl = await fal.storage.upload(photo, { lifecycle: FAL_STORAGE });
        const queued = await fal.queue.submit(model.endpoint, { input: model.input(imageUrl), storageSettings: FAL_STORAGE });
        requestId = queued.request_id;
        if (abort.signal.aborted) {
          fal.queue.cancel(model.endpoint, { requestId }).catch(() => undefined);
          return;
        }
        let phase = "queued";
        send({ phase: "queued", t: t() });
        const completed = await fal.queue.subscribeToStatus(model.endpoint, {
          requestId,
          mode: "polling",
          pollInterval: STATUS_POLL_MS,
          logs: false,
          abortSignal: abort.signal,
          onQueueUpdate: (status) => {
            const next = mapQueueStatus(status);
            if ((next === "queued" || next === "running") && next !== phase) {
              phase = next;
              send({ phase: next, t: t() });
            }
          },
        });
        if (mapQueueStatus(completed) !== "done") return send({ error: "failed", t: t() });
        send({ phase: "downloading", t: t() });
        const url = model.glbUrl((await fal.queue.result(model.endpoint, { requestId, abortSignal: abort.signal })).data);
        if (typeof url !== "string" || !url.startsWith("https://")) return send({ error: "upstream", t: t() });
        const glb = await downloadGlb(url, abort.signal);
        if (glb === "too-large" || !glb) return send({ error: glb ? "too-large" : "upstream", t: t() });
        send({ phase: "done", t: t(), glb: Buffer.from(glb).toString("base64") });
      } catch (error) {
        const status = upstreamStatus(error);
        send({ error: status !== null && status >= 400 && status < 500 ? "failed" : "upstream", t: t() });
      } finally {
        finished = true;
        requestSignal.removeEventListener("abort", stop);
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      }
    },
    cancel: stop,
  });
  return new Response(stream, { headers: { "Content-Type": MODEL3D_STREAM_TYPE, "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

/** Accepts one photo and streams the 3D model built from it by the selected fal.ai model. */
export async function POST(request: Request) {
  if (!model3dEnabled()) return jsonResponse({ error: "disabled" }, 503);
  const ip = clientIp(request.headers);
  const limit = limiter.check(ip);
  if (limit) return jsonResponse({ error: "rate-limited", limit }, 429);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return jsonResponse({ error: "too-large" }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid-count" }, 400);
  }
  const photo = await validatePhotoForm(form);
  if (!photo.ok) return jsonResponse({ error: photo.error }, photo.status);
  limiter.record(ip);
  return streamModel(photo.file, request.signal);
}
