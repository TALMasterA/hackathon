import { isJobId, MODEL3D_ENDPOINT } from "@/lib/model3d/contract";
import { falClient, jsonResponse, mapQueueStatus, model3dEnabled, upstreamStatus } from "@/lib/model3d/fal-server";

/** Maps fal's queue status to queued / running / done / failed. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!model3dEnabled()) return jsonResponse({ error: "disabled" }, 503);
  const { id } = await params;
  if (!isJobId(id)) return jsonResponse({ error: "invalid-id" }, 400);
  try {
    return jsonResponse({ status: mapQueueStatus(await falClient().queue.status(MODEL3D_ENDPOINT, { requestId: id, logs: false })) });
  } catch (error) {
    const status = upstreamStatus(error);
    return status !== null && status >= 400 && status < 500 ? jsonResponse({ status: "failed" }) : jsonResponse({ error: "upstream" }, 502);
  }
}
