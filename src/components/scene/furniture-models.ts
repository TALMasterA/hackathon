import type { FlatFurniture, FurnitureKind } from "../../types/domain";

/** "boxes" is the exact checked geometry; "models" stretches a furniture model to the same box. */
export type FurnitureAppearance = "models" | "boxes";

/** Kenney Furniture Kit 2.0 (CC0) models, copied under FitIn names into public/models/furniture. */
export const FURNITURE_MODEL_ROOT = "/models/furniture";
export const DOUBLE_BED_MIN_WIDTH_CM = 120;

const KIND_MODELS: Partial<Record<FurnitureKind, string>> = {
  sofa: "sofa",
  "coffee-table": "coffee-table",
  "tv-console": "tv-console",
  "side-table": "side-table",
  "dining-table": "dining-table",
  chair: "chair",
  wardrobe: "wardrobe",
  desk: "desk",
  "kitchen-counter": "kitchen-counter",
  fridge: "fridge",
  toilet: "toilet",
  vanity: "vanity",
};

const modelUrl = (file: string) => `${FURNITURE_MODEL_ROOT}/${file}.glb`;

/** Appearance only: the model is stretched to the item's box, which is what every check uses. */
export function furnitureModelUrl(item: Pick<FlatFurniture, "kind" | "width">): string | null {
  if (item.kind === "bed") return modelUrl(item.width >= DOUBLE_BED_MIN_WIDTH_CM ? "bed-double" : "bed-single");
  const file = KIND_MODELS[item.kind];
  return file ? modelUrl(file) : null;
}

export const FURNITURE_MODEL_URLS: readonly string[] = [...Object.values(KIND_MODELS), "bed-double", "bed-single"].map(modelUrl);
