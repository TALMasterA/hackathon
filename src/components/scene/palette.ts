import type { FurnitureItem } from "@/types/domain";

export const FURNITURE_COLORS: Record<FurnitureItem["kind"], string> = {
  sofa: "#75958b",
  "coffee-table": "#bc795f",
  "tv-console": "#5e6863",
  "side-table": "#d0aa54",
};

export const CANDIDATE_COLOR = "#33765d";
export const RESERVED_COLOR = "#ae8128";
export const SCENE_BACKGROUND = "#e8eeeb";
export const METRES_PER_CM = 0.01;