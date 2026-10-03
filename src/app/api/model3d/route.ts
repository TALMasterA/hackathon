import { MODEL3D_ENDPOINT, MODEL3D_MAX_PHOTO_BYTES } from "@/lib/model3d/contract";
import { FAL_STORAGE, falClient, jsonResponse, model3dEnabled } from "@/lib/model3d/fal-server";
import { clientIp, RateLimiter } from "@/lib/model3d/rate-limit";
import { validatePhotoForm } from "@/lib/model3d/validation";

const limiter = new RateLimiter();
/** Multipart overhead allowance on top of the 4 MB photo before the body is even parsed. */
const MAX_BODY_BYTES = MODEL3D_MAX_PHOTO_BYTES + 64 * 1024;

/** Accepts one photo, hands it to fal.ai TRELLIS and returns only the queue job ID. */
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
  try {
    const fal = falClient();
    const imageUrl = await fal.storage.upload(photo.file, { lifecycle: FAL_STORAGE });
    const queued = await fal.queue.submit(MODEL3D_ENDPOINT, { input: { image_url: imageUrl }, storageSettings: FAL_STORAGE });
    return jsonResponse({ jobId: queued.request_id });
  } catch {
    return jsonResponse({ error: "upstream" }, 502);
  }
}
