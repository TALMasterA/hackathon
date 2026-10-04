import type { FurnitureKind } from "@/types/domain";
import { FURNITURE_INKS, INK, PLAN_INK, SCENE_INK } from "@/lib/theme";

export const FURNITURE_COLORS: Record<FurnitureKind, string> = FURNITURE_INKS;

export const CANDIDATE_COLOR = INK.emerald;
export const COLLISION_COLOR = INK.vermilion;
export const COLLISION_OPACITY = 0.55;
export const EDGE_COLOR = PLAN_INK.itemRule;
export const SELECTED_EDGE_COLOR = INK.ultramarine;
export const RESERVED_COLOR = SCENE_INK.door;
export const SCENE_BACKGROUND = SCENE_INK.background;
export const METRES_PER_CM = 0.01;
