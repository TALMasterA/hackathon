import type { FurnitureKind } from "@/types/domain";

export const FURNITURE_COLORS: Record<FurnitureKind, string> = {
  sofa: "#75958b",
  "coffee-table": "#bc795f",
  "tv-console": "#5e6863",
  "side-table": "#d0aa54",
  "dining-table": "#b39662",
  chair: "#879a79",
  bed: "#7b8d9c",
  wardrobe: "#a59787",
  desk: "#b6846e",
  "kitchen-counter": "#8b9998",
  fridge: "#b7c5c8",
  toilet: "#d5d7d4",
  vanity: "#8daea8",
};

export const CANDIDATE_COLOR = "#33765d";
export const COLLISION_COLOR = "#ba4c43";
export const COLLISION_OPACITY = 0.55;
export const EDGE_COLOR = "#59635a";
export const SELECTED_EDGE_COLOR = "#174c3d";
export const RESERVED_COLOR = "#ae8128";
export const SCENE_BACKGROUND = "#e8eeeb";
export const METRES_PER_CM = 0.01;