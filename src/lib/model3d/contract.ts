/** Shared by the /api/model3d route handlers and the browser client. Holds no secrets. */

export const MODEL3D_ENDPOINT = "fal-ai/trellis";
export const MODEL3D_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MODEL3D_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MODEL3D_MAX_MODEL_BYTES = 50 * 1024 * 1024;

export type Model3dStatus = "queued" | "running" | "done" | "failed";

export type Model3dErrorCode = "disabled" | "rate-limited" | "invalid-count" | "invalid-type" | "too-large" | "invalid-id" | "upstream";

/** fal request IDs are UUIDs; anything else is rejected before it reaches fal. */
export function isJobId(id: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(id);
}
