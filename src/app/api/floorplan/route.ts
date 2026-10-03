import { FLOORPLAN_RATE_LIMITS, FLOORPLAN_TIMEOUT_MS } from "@/lib/floorplan/ai-contract";
import { isFlatType } from "@/lib/floorplan/trace";
import { floorplanEnabled, readPlan, UnreadablePlanError } from "@/lib/floorplan/vision-server";
import { MODEL3D_MAX_PHOTO_BYTES } from "@/lib/model3d/contract";
import { jsonResponse } from "@/lib/model3d/fal-server";
import { clientIp, RateLimiter } from "@/lib/model3d/rate-limit";
import { validatePhotoForm } from "@/lib/model3d/validation";

const limiter = new RateLimiter(FLOORPLAN_RATE_LIMITS);
/** Multipart overhead allowance on top of the 4 MB picture before the body is even parsed. */
const MAX_BODY_BYTES = MODEL3D_MAX_PHOTO_BYTES + 64 * 1024;

/**
 * Accepts one cropped plan picture (PNG, JPEG or WebP, up to 4 MB) and an optional flat-type hint
 * (?type=2B), and answers with the rooms, doors and windows a vision model read from it.
 */
export async function POST(request: Request) {
  if (!floorplanEnabled()) return jsonResponse({ error: "disabled" }, 503);
  const hint = new URL(request.url).searchParams.get("type");
  if (hint !== null && hint !== "" && !isFlatType(hint)) return jsonResponse({ error: "invalid-hint" }, 400);
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
  const picture = await validatePhotoForm(form);
  if (!picture.ok) return jsonResponse({ error: picture.error }, picture.status);
  limiter.record(ip);
  const timeout = AbortSignal.timeout(FLOORPLAN_TIMEOUT_MS);
  try {
    return jsonResponse(await readPlan(picture.file, isFlatType(hint) ? hint : null, AbortSignal.any([request.signal, timeout])));
  } catch (error) {
    if (timeout.aborted) return jsonResponse({ error: "timeout" }, 504);
    if (error instanceof UnreadablePlanError) return jsonResponse({ error: "unreadable" }, 502);
    return jsonResponse({ error: "upstream" }, 502);
  }
}
