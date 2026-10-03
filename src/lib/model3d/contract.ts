/** Shared by the /api/model3d route handler and the browser client. Holds no secrets. */

export const MODEL3D_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MODEL3D_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MODEL3D_MAX_MODEL_BYTES = 30 * 1024 * 1024;
export const MODEL3D_STREAM_TYPE = "application/x-ndjson";

export type Model3dStatus = "queued" | "running" | "done" | "failed";

export type Model3dErrorCode = "disabled" | "rate-limited" | "invalid-count" | "invalid-type" | "too-large" | "upstream" | "failed";

/**
 * One line of the POST /api/model3d stream once the photo is accepted. `t` is milliseconds since
 * acceptance. The last line is either `done` with the base64 GLB or an error; no fal URL or job ID is sent.
 */
export type Model3dEvent =
  | { phase: "queued" | "running" | "downloading"; t: number }
  | { phase: "done"; t: number; glb: string }
  | { error: Extract<Model3dErrorCode, "upstream" | "failed" | "too-large">; t: number };
