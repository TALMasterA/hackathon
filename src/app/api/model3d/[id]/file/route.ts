import { isJobId, MODEL3D_ENDPOINT, MODEL3D_MAX_MODEL_BYTES } from "@/lib/model3d/contract";
import { falClient, jsonResponse, model3dEnabled } from "@/lib/model3d/fal-server";

function capped(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let received = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > limit) controller.error(new Error("Model too large"));
      else controller.enqueue(chunk);
    },
  }));
}

/** Fetches the finished GLB server-side and streams it back; the fal file URL never reaches the browser. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!model3dEnabled()) return jsonResponse({ error: "disabled" }, 503);
  const { id } = await params;
  if (!isJobId(id)) return jsonResponse({ error: "invalid-id" }, 400);
  let url: unknown;
  try {
    url = (await falClient().queue.result(MODEL3D_ENDPOINT, { requestId: id })).data?.model_mesh?.url;
  } catch {
    return jsonResponse({ error: "upstream" }, 502);
  }
  if (typeof url !== "string" || !url.startsWith("https://")) return jsonResponse({ error: "upstream" }, 502);
  const upstream = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return jsonResponse({ error: "upstream" }, 502);
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MODEL3D_MAX_MODEL_BYTES) return jsonResponse({ error: "too-large" }, 502);
  return new Response(capped(upstream.body, MODEL3D_MAX_MODEL_BYTES), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "no-store", ...(length > 0 ? { "Content-Length": String(length) } : {}) } });
}
