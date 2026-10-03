import { createFalClient, type FalClient, type QueueStatus } from "@fal-ai/client";
import type { Model3dStatus } from "./contract";

/** Server-only: FAL_KEY is read from the environment at request time and never sent to the browser. */
export function model3dEnabled(): boolean {
  return process.env.MODEL3D_ENABLED === "true" && Boolean(process.env.FAL_KEY);
}

let client: FalClient | null = null;

export function falClient(): FalClient {
  client ??= createFalClient({ credentials: () => process.env.FAL_KEY ?? "" });
  return client;
}

/** fal reports a failed run as COMPLETED with an error; anything unrecognised is treated as failed. */
export function mapQueueStatus(status: Pick<QueueStatus, "status"> & { error?: unknown }): Model3dStatus {
  if (status.status === "IN_QUEUE") return "queued";
  if (status.status === "IN_PROGRESS") return "running";
  return status.status === "COMPLETED" && !status.error ? "done" : "failed";
}

/** Uploads and generated files expire on fal's side; FitIn itself stores neither. */
export const FAL_STORAGE = { expiresIn: "1h" } as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function upstreamStatus(error: unknown): number | null {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
}
