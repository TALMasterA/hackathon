/** Server-only: which fal.ai image-to-3D model builds a look. The choice never reaches the browser. */

export interface Model3dModel {
  endpoint: string;
  input: (imageUrl: string) => Record<string, unknown>;
  /** The finished GLB's URL in the model's result data, if any. */
  glbUrl: (data: unknown) => unknown;
}

const field = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined);

export const MODEL3D_MODELS = {
  /** About US$0.02 per model. */
  trellis: {
    endpoint: "fal-ai/trellis",
    input: (imageUrl) => ({ image_url: imageUrl }),
    glbUrl: (data) => field(field(data, "model_mesh"), "url"),
  },
  /** About US$0.30 per model at resolution 1024; capped well below its 500k-triangle, 2048 px defaults to stay light. */
  "trellis-2": {
    endpoint: "fal-ai/trellis-2",
    input: (imageUrl) => ({ image_url: imageUrl, resolution: 1024, decimation_target: 50_000, texture_size: 1024 }),
    glbUrl: (data) => field(field(data, "model_glb"), "url"),
  },
} satisfies Record<string, Model3dModel>;

export type Model3dModelName = keyof typeof MODEL3D_MODELS;

/** `MODEL3D_MODEL` picks the model; unset or unknown values use TRELLIS. */
export function selectedModel(): Model3dModel {
  const name = process.env.MODEL3D_MODEL;
  return name && Object.hasOwn(MODEL3D_MODELS, name) ? MODEL3D_MODELS[name as Model3dModelName] : MODEL3D_MODELS.trellis;
}
